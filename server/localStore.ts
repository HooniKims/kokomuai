import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultAiSettings, type AiSettings } from "../src/domain/ai/aiSettings";
import type { ManagedChatbot } from "../src/domain/chatbot/chatbotManagement";
import type { AdminActionLogEvent, IdentityTeacherAccount } from "../src/domain/identity/identityAccess";
import { aggregateUsageByMonth, type UsageAccountingEvent } from "../src/domain/usage/usageAccounting";
import type { ProviderErrorLogEntry, StorePort } from "./storePort";

export interface LocalStoreData {
  version: 1;
  teachers: IdentityTeacherAccount[];
  chatbots: ManagedChatbot[];
  usageEvents: UsageAccountingEvent[];
  aiSettings: AiSettings;
  adminActionLogs: AdminActionLogEvent[];
  providerErrorLogs: ProviderErrorLogEntry[];
}

export type LocalStore = StorePort;

const defaultStorePath = join(dirname(fileURLToPath(import.meta.url)), "data", "local-dev-store.json");
const updateQueues = new Map<string, Promise<void>>();

export function createLocalStore(filePath = defaultStorePath): LocalStore {
  const storePath = resolve(filePath);

  return {
    async listTeachers() {
      const data = await readStore(storePath);
      return cloneJson(data.teachers);
    },

    async getTeacher(id) {
      const data = await readStore(storePath);
      return cloneJson(data.teachers.find((teacher) => teacher.id === id));
    },

    async saveTeacher(teacher) {
      await updateStore(storePath, (data) => {
        upsertById(data.teachers, cloneJson(teacher));
      });
    },

    async saveTeacherIfEmailAbsent(teacher) {
      let result: { teacher: IdentityTeacherAccount; created: boolean } | undefined;
      await updateStore(storePath, (data) => {
        const normalizedTeacher = cloneJson(teacher);
        const existing = data.teachers.find((item) => item.email === normalizedTeacher.email);
        if (existing) {
          result = { teacher: cloneJson(existing), created: false };
          return;
        }

        data.teachers.push(normalizedTeacher);
        result = { teacher: cloneJson(normalizedTeacher), created: true };
      });

      if (!result) throw new Error("Teacher save result was not created");
      return result;
    },

    async updateTeacherWithAdminAction(teacherId, update) {
      let result: { teacher: IdentityTeacherAccount; event?: AdminActionLogEvent } | undefined;
      await updateStore(storePath, (data) => {
        const existing = data.teachers.find((teacher) => teacher.id === teacherId);
        if (!existing) return;

        result = update(cloneJson(existing));
        upsertById(data.teachers, cloneJson(result.teacher));
        if (result.event) {
          data.adminActionLogs.push(toAdminActionLog(result.event));
        }
      });

      return cloneJson(result);
    },

    async listChatbots() {
      const data = await readStore(storePath);
      return cloneJson(data.chatbots);
    },

    async listChatbotsByOwner(ownerTeacherId) {
      const data = await readStore(storePath);
      return cloneJson(data.chatbots.filter((chatbot) => chatbot.ownerTeacherId === ownerTeacherId));
    },

    async getChatbot(id) {
      const data = await readStore(storePath);
      return cloneJson(data.chatbots.find((chatbot) => chatbot.id === id));
    },

    async saveChatbot(chatbot) {
      await updateStore(storePath, (data) => {
        upsertById(data.chatbots, cloneJson(chatbot));
      });
    },

    async findChatbotByShareToken(token) {
      const data = await readStore(storePath);
      const normalizedToken = token.trim();
      return cloneJson(data.chatbots.find((chatbot) => chatbot.share.publicToken === normalizedToken));
    },

    async appendUsageEvent(event) {
      await updateStore(storePath, (data) => {
        data.usageEvents.push(toUsageAccountingEvent(event));
      });
    },

    async listUsageEvents() {
      const data = await readStore(storePath);
      return cloneJson(data.usageEvents);
    },

    async listUsageSummaries() {
      const data = await readStore(storePath);
      return aggregateUsageByMonth(data.usageEvents);
    },

    async listUsageSummariesByTeacher(teacherId) {
      const data = await readStore(storePath);
      return aggregateUsageByMonth(data.usageEvents.filter((event) => event.teacherId === teacherId));
    },

    async getAiSettings() {
      const data = await readStore(storePath);
      return cloneJson(data.aiSettings);
    },

    async saveAiSettings(settings) {
      await updateStore(storePath, (data) => {
        data.aiSettings = cloneJson(settings);
      });
    },

    async appendAdminActionLog(event) {
      await updateStore(storePath, (data) => {
        data.adminActionLogs.push(toAdminActionLog(event));
      });
    },

    async listAdminActionLogs() {
      const data = await readStore(storePath);
      return cloneJson(data.adminActionLogs);
    },

    async appendProviderErrorLog(event) {
      await updateStore(storePath, (data) => {
        data.providerErrorLogs.push(toProviderErrorLog(event));
      });
    },

    async listProviderErrorLogs() {
      const data = await readStore(storePath);
      return cloneJson(data.providerErrorLogs);
    }
  };
}

async function readStore(filePath: string): Promise<LocalStoreData> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<LocalStoreData>;
    return normalizeStoreData(parsed);
  } catch (error) {
    if (isNodeFileError(error) && error.code === "ENOENT") {
      const data = createSeedData();
      await writeStore(filePath, data);
      return data;
    }

    throw error;
  }
}

async function updateStore(filePath: string, update: (data: LocalStoreData) => void): Promise<void> {
  const queueKey = getQueueKey(filePath);
  const previous = updateQueues.get(queueKey) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const data = await readStore(filePath);
    update(data);
    await writeStore(filePath, data);
  });

  updateQueues.set(queueKey, next);

  try {
    await next;
  } finally {
    if (updateQueues.get(queueKey) === next) {
      updateQueues.delete(queueKey);
    }
  }
}

async function writeStore(filePath: string, data: LocalStoreData): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function getQueueKey(filePath: string): string {
  const normalized = resolve(filePath);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function normalizeStoreData(data: Partial<LocalStoreData>): LocalStoreData {
  return {
    version: 1,
    teachers: Array.isArray(data.teachers) ? data.teachers : createSeedData().teachers,
    chatbots: Array.isArray(data.chatbots) ? data.chatbots : [],
    usageEvents: Array.isArray(data.usageEvents) ? data.usageEvents.map(toUsageAccountingEvent) : [],
    aiSettings: isAiSettings(data.aiSettings) ? data.aiSettings : createDefaultAiSettings("2026-06-11T00:00:00.000Z"),
    adminActionLogs: Array.isArray(data.adminActionLogs) ? data.adminActionLogs.map(toAdminActionLog) : [],
    providerErrorLogs: Array.isArray(data.providerErrorLogs) ? data.providerErrorLogs.map(toProviderErrorLog) : []
  };
}

function createSeedData(): LocalStoreData {
  return {
    version: 1,
    teachers: [
      {
        id: "local-admin",
        realName: "로컬 관리자",
        displayName: "로컬 관리자",
        email: "admin@local.test",
        loginProvider: "password",
        passwordHash: "local-dev-admin-password-hash",
        school: {
          schoolName: "로컬 테스트 학교",
          schoolKind: "기타",
          officeCode: "LOCAL",
          standardSchoolCode: "LOCAL",
          region: "로컬"
        },
        status: "admin",
        createdAt: "2026-06-11T00:00:00.000Z",
        promotedAt: "2026-06-11T00:00:00.000Z",
        promotedBy: "system"
      }
    ],
    chatbots: [],
    usageEvents: [],
    aiSettings: createDefaultAiSettings("2026-06-11T00:00:00.000Z"),
    adminActionLogs: [],
    providerErrorLogs: []
  };
}

function toAdminActionLog(input: AdminActionLogEvent): AdminActionLogEvent {
  const event: AdminActionLogEvent = {
    id: input.id,
    type: input.type,
    action: input.action,
    adminId: input.adminId,
    targetTeacherId: input.targetTeacherId,
    createdAt: input.createdAt
  };

  if (input.reason !== undefined) {
    event.reason = input.reason;
  }
  if (input.targetChatbotId !== undefined) {
    event.targetChatbotId = input.targetChatbotId;
  }

  return event;
}

function toProviderErrorLog(input: ProviderErrorLogEntry): ProviderErrorLogEntry {
  const event: ProviderErrorLogEntry = {
    id: input.id,
    occurredAt: input.occurredAt,
    provider: input.provider,
    message: input.message
  };

  if (typeof input.status === "number") event.status = input.status;
  if (input.code !== undefined) event.code = input.code;
  if (input.teacherId !== undefined) event.teacherId = input.teacherId;
  if (input.chatbotId !== undefined) event.chatbotId = input.chatbotId;
  if (input.surface !== undefined) event.surface = input.surface;
  if (Array.isArray(input.riskCodes)) event.riskCodes = [...input.riskCodes];

  return event;
}

function isAiSettings(value: unknown): value is AiSettings {
  return (
    typeof value === "object" &&
    value !== null &&
    "activeModelId" in value &&
    typeof value.activeModelId === "string" &&
    "updatedAt" in value &&
    typeof value.updatedAt === "string" &&
    "updatedBy" in value &&
    typeof value.updatedBy === "string"
  );
}

function toUsageAccountingEvent(input: UsageAccountingEvent): UsageAccountingEvent {
  if (input.kind === "error") {
    const event: UsageAccountingEvent = {
      id: input.id,
      kind: "error",
      teacherId: input.teacherId,
      chatbotId: input.chatbotId,
      conversationId: input.conversationId,
      occurredAt: input.occurredAt,
      month: input.month,
      surface: input.surface,
      inputTextLength: input.inputTextLength,
      assistantTextLength: input.assistantTextLength,
      inputTokenEstimate: input.inputTokenEstimate,
      outputTokenEstimate: input.outputTokenEstimate,
      estimatedCostUsd: input.estimatedCostUsd,
      errorCode: input.errorCode,
      riskCodes: [...input.riskCodes]
    };

    if (input.provider !== undefined) event.provider = input.provider;
    if (input.modelId !== undefined) event.modelId = input.modelId;

    if (input.technical !== undefined) {
      event.technical = {
        ...(input.technical.provider !== undefined ? { provider: input.technical.provider } : {}),
        ...(typeof input.technical.status === "number" ? { status: input.technical.status } : {}),
        ...(input.technical.code !== undefined ? { code: input.technical.code } : {})
      };
    }

    return event;
  }

  return {
    id: input.id,
    kind: "ai_call",
    teacherId: input.teacherId,
    chatbotId: input.chatbotId,
    conversationId: input.conversationId,
    occurredAt: input.occurredAt,
    month: input.month,
    surface: input.surface,
    inputTextLength: input.inputTextLength,
    outputTextLength: input.outputTextLength,
    inputTokenEstimate: input.inputTokenEstimate,
    outputTokenEstimate: input.outputTokenEstimate,
    estimatedCostUsd: input.estimatedCostUsd,
    provider: input.provider,
    modelId: input.modelId,
    riskCodes: [...input.riskCodes]
  };
}

function upsertById<T extends { id: string }>(items: T[], item: T): void {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) {
    items.push(item);
    return;
  }

  items[index] = item;
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function isNodeFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
