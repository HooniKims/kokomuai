import { createDefaultAiSettings, normalizeAiSettings, type AiSettings } from "../src/domain/ai/aiSettings.js";
import type { AiProvider } from "../src/domain/ai/modelCatalog.js";
import type { ManagedChatbot } from "../src/domain/chatbot/chatbotManagement.js";
import type { AdminActionLogEvent, IdentityTeacherAccount } from "../src/domain/identity/identityAccess.js";
import type {
  AiCallUsageEvent,
  MonthlyUsageSummary,
  UsageAccountingEvent,
  UsageErrorEvent,
  UsageSurface
} from "../src/domain/usage/usageAccounting.js";
import type { ProviderErrorLogEntry, StorePort } from "./storePort.js";

export interface FirestoreDocumentSnapshotLike {
  exists: boolean;
  id?: string;
  data(): unknown;
}

export interface FirestoreDocumentLike {
  get(): Promise<FirestoreDocumentSnapshotLike>;
  set(data: unknown, options?: { merge?: boolean }): Promise<void>;
  delete(): Promise<void>;
}

export interface FirestoreCollectionLike {
  get(): Promise<{ docs: Array<{ id: string; data(): unknown }> }>;
  where(fieldPath: string, opStr: "==", value: unknown): FirestoreCollectionLike;
}

export interface FirestoreTransactionLike {
  get(document: FirestoreDocumentLike): Promise<FirestoreDocumentSnapshotLike>;
  set(document: FirestoreDocumentLike, data: unknown, options?: { merge?: boolean }): Promise<void> | void;
}

export interface FirestoreLike {
  doc(path: string): FirestoreDocumentLike;
  collection(path: string): FirestoreCollectionLike;
  runTransaction?<T>(updateFunction: (transaction: FirestoreTransactionLike) => Promise<T>): Promise<T>;
}

interface ShareTokenDoc {
  chatbotId: string;
  ownerTeacherId: string;
  expiresAt: string | null;
}

interface UsageSurfaceAggregate {
  conversationCount: number;
  aiCallCount: number;
  errorCount: number;
  inputTokenEstimate: number;
  outputTokenEstimate: number;
}

interface UsageMonthlyDoc extends UsageSurfaceAggregate {
  teacherId: string;
  chatbotId: string;
  month: string;
  estimatedCostUsd: number;
  provider?: AiProvider;
  modelId?: string;
  conversationIds: string[];
  riskCodes: string[];
  surfaces: Record<UsageSurface, UsageSurfaceAggregate>;
}

export function createFirebaseStore(firestore: FirestoreLike): StorePort {
  return {
    async listTeachers() {
      return listCollection<IdentityTeacherAccount>(firestore, "teachers");
    },

    async getTeacher(id) {
      return getDocument<IdentityTeacherAccount>(firestore, teacherPath(id));
    },

    async saveTeacher(teacher) {
      await firestore.doc(teacherPath(teacher.id)).set(cloneJson(teacher));
    },

    async saveTeacherIfEmailAbsent(teacher) {
      const normalized = cloneJson(teacher);
      const existing = (await queryCollection<IdentityTeacherAccount>(firestore, "teachers", "email", normalized.email))[0];
      if (existing) return { teacher: existing, created: false };

      await firestore.doc(teacherPath(normalized.id)).set(normalized);
      return { teacher: normalized, created: true };
    },

    async updateTeacherWithAdminAction(teacherId, update) {
      const existing = await getDocument<IdentityTeacherAccount>(firestore, teacherPath(teacherId));
      if (!existing) return undefined;

      const result = update(existing);
      await firestore.doc(teacherPath(result.teacher.id)).set(cloneJson(result.teacher));
      if (result.event) {
        await firestore.doc(adminLogPath(result.event.id)).set(toAdminActionLog(result.event));
      }
      return cloneJson(result);
    },

    async listChatbots() {
      return listCollection<ManagedChatbot>(firestore, "chatbots");
    },

    async listChatbotsByOwner(ownerTeacherId) {
      return queryCollection<ManagedChatbot>(firestore, "chatbots", "ownerTeacherId", ownerTeacherId);
    },

    async getChatbot(id) {
      return getDocument<ManagedChatbot>(firestore, chatbotPath(id));
    },

    async saveChatbot(chatbot) {
      const existing = await getDocument<ManagedChatbot>(firestore, chatbotPath(chatbot.id));
      await firestore.doc(chatbotPath(chatbot.id)).set(cloneJson(chatbot));

      const oldToken = existing?.share.enabled ? existing.share.publicToken : "";
      const nextToken = chatbot.share.enabled ? chatbot.share.publicToken : "";
      if (oldToken && oldToken !== nextToken) {
        await firestore.doc(shareTokenPath(oldToken)).delete();
      }
      if (nextToken) {
        await firestore.doc(shareTokenPath(nextToken)).set({
          chatbotId: chatbot.id,
          ownerTeacherId: chatbot.ownerTeacherId,
          expiresAt: chatbot.share.expiresAt
        } satisfies ShareTokenDoc);
      }
    },

    async findChatbotByShareToken(token) {
      const share = await getDocument<ShareTokenDoc>(firestore, shareTokenPath(token.trim()));
      if (!share) return undefined;
      return getDocument<ManagedChatbot>(firestore, chatbotPath(share.chatbotId));
    },

    async appendUsageEvent(event) {
      await appendUsageEventToMonthlyDoc(firestore, event);
    },

    async listUsageEvents() {
      const docs = await listCollection<UsageMonthlyDoc>(firestore, "usageMonthly");
      return docs.flatMap(toSyntheticUsageEvents);
    },

    async listUsageSummaries() {
      const docs = await listCollection<UsageMonthlyDoc>(firestore, "usageMonthly");
      return docs.map(toMonthlyUsageSummary).sort((left, right) => {
        const leftKey = `${left.teacherId}:${left.chatbotId}:${left.month}`;
        const rightKey = `${right.teacherId}:${right.chatbotId}:${right.month}`;
        return leftKey.localeCompare(rightKey);
      });
    },

    async listUsageSummariesByTeacher(teacherId) {
      const docs = await queryCollection<UsageMonthlyDoc>(firestore, "usageMonthly", "teacherId", teacherId);
      return docs.map(toMonthlyUsageSummary).sort((left, right) => {
        const leftKey = `${left.teacherId}:${left.chatbotId}:${left.month}`;
        const rightKey = `${right.teacherId}:${right.chatbotId}:${right.month}`;
        return leftKey.localeCompare(rightKey);
      });
    },

    async getAiSettings() {
      const settings = (await getDocument<AiSettings>(firestore, "settings/ai")) ?? createDefaultAiSettings("2026-06-11T00:00:00.000Z");
      return normalizeAiSettings(settings);
    },

    async saveAiSettings(settings) {
      await firestore.doc("settings/ai").set(cloneJson(settings));
    },

    async appendAdminActionLog(event) {
      await firestore.doc(adminLogPath(event.id)).set(toAdminActionLog(event));
    },

    async listAdminActionLogs() {
      return listCollection<AdminActionLogEvent>(firestore, "adminLogs");
    },

    async appendProviderErrorLog(event) {
      await firestore.doc(providerErrorPath(event.id)).set(toProviderErrorLog(event));
    },

    async listProviderErrorLogs() {
      return listCollection<ProviderErrorLogEntry>(firestore, "providerErrors");
    }
  };
}

async function appendUsageEventToMonthlyDoc(firestore: FirestoreLike, event: UsageAccountingEvent): Promise<void> {
  const path = usageMonthlyPath(event.teacherId, event.month, event.chatbotId);
  const reference = firestore.doc(path);

  if (typeof firestore.runTransaction === "function") {
    await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const current = snapshot.exists ? (cloneJson(snapshot.data()) as UsageMonthlyDoc) : createEmptyUsageMonthlyDoc(event);
      transaction.set(reference, addUsageEventToMonthlyDoc(current, event));
    });
    return;
  }

  const current = (await getDocument<UsageMonthlyDoc>(firestore, path)) ?? createEmptyUsageMonthlyDoc(event);
  await reference.set(addUsageEventToMonthlyDoc(current, event));
}

function createEmptyUsageMonthlyDoc(event: UsageAccountingEvent): UsageMonthlyDoc {
  return {
    teacherId: event.teacherId,
    chatbotId: event.chatbotId,
    month: event.month,
    conversationCount: 0,
    aiCallCount: 0,
    errorCount: 0,
    inputTokenEstimate: 0,
    outputTokenEstimate: 0,
    estimatedCostUsd: 0,
    provider: event.provider,
    modelId: event.modelId,
    conversationIds: [],
    riskCodes: [],
    surfaces: {
      student_share: createEmptySurfaceAggregate(),
      teacher_preview: createEmptySurfaceAggregate()
    }
  };
}

function addUsageEventToMonthlyDoc(current: UsageMonthlyDoc, event: UsageAccountingEvent): UsageMonthlyDoc {
  const next = cloneJson(current);
  const surface = next.surfaces[event.surface] ?? createEmptySurfaceAggregate();
  next.surfaces[event.surface] = surface;
  const conversationKey = event.conversationId ?? `${event.kind}:${event.id}`;
  if (!next.conversationIds.includes(conversationKey)) {
    next.conversationIds.push(conversationKey);
    next.conversationCount += 1;
    surface.conversationCount += 1;
  }

  next.provider = event.provider ?? next.provider;
  next.modelId = event.modelId ?? next.modelId;
  next.inputTokenEstimate += event.inputTokenEstimate;
  next.outputTokenEstimate += event.outputTokenEstimate;
  next.estimatedCostUsd += event.estimatedCostUsd;
  next.riskCodes = Array.from(new Set([...next.riskCodes, ...event.riskCodes]));

  if (event.kind === "ai_call") {
    next.aiCallCount += 1;
    surface.aiCallCount += 1;
  } else {
    next.errorCount += 1;
    surface.errorCount += 1;
  }

  surface.inputTokenEstimate += event.inputTokenEstimate;
  surface.outputTokenEstimate += event.outputTokenEstimate;
  return next;
}

function toSyntheticUsageEvents(doc: UsageMonthlyDoc): UsageAccountingEvent[] {
  const events: UsageAccountingEvent[] = [];
  if (doc.aiCallCount > 0) {
    events.push({
      id: `aggregate-${doc.teacherId}_${doc.month}_${doc.chatbotId}`,
      kind: "ai_call",
      provider: doc.provider ?? "lmstudio",
      modelId: doc.modelId ?? "lmstudio:gemma-4-12b-it",
      teacherId: doc.teacherId,
      chatbotId: doc.chatbotId,
      conversationId: doc.conversationIds[0],
      occurredAt: `${doc.month}-01T00:00:00.000Z`,
      month: doc.month,
      surface: "student_share",
      inputTextLength: 0,
      outputTextLength: 0,
      inputTokenEstimate: doc.inputTokenEstimate,
      outputTokenEstimate: doc.outputTokenEstimate,
      estimatedCostUsd: doc.estimatedCostUsd,
      riskCodes: doc.riskCodes
    } satisfies AiCallUsageEvent);
  }

  if (doc.errorCount > 0) {
    events.push({
      id: `aggregate-error-${doc.teacherId}_${doc.month}_${doc.chatbotId}`,
      kind: "error",
      provider: doc.provider,
      modelId: doc.modelId,
      teacherId: doc.teacherId,
      chatbotId: doc.chatbotId,
      conversationId: doc.conversationIds[0],
      occurredAt: `${doc.month}-01T00:00:00.000Z`,
      month: doc.month,
      surface: "student_share",
      inputTextLength: 0,
      assistantTextLength: 0,
      inputTokenEstimate: 0,
      outputTokenEstimate: 0,
      estimatedCostUsd: 0,
      errorCode: "aggregate_error",
      riskCodes: doc.riskCodes
    } satisfies UsageErrorEvent);
  }

  return events;
}

function toMonthlyUsageSummary(doc: UsageMonthlyDoc): MonthlyUsageSummary {
  return {
    teacherId: doc.teacherId,
    chatbotId: doc.chatbotId,
    month: doc.month,
    conversationCount: doc.conversationCount,
    aiCallCount: doc.aiCallCount,
    errorCount: doc.errorCount,
    inputTokenEstimate: doc.inputTokenEstimate,
    outputTokenEstimate: doc.outputTokenEstimate,
    estimatedCostUsd: roundCurrency(doc.estimatedCostUsd),
    estimatedCostKrw: estimateCostKrw(doc.estimatedCostUsd),
    surfaces: {
      student_share: cloneJson(doc.surfaces.student_share ?? createEmptySurfaceAggregate()),
      teacher_preview: cloneJson(doc.surfaces.teacher_preview ?? createEmptySurfaceAggregate())
    }
  };
}

function createEmptySurfaceAggregate(): UsageSurfaceAggregate {
  return {
    conversationCount: 0,
    aiCallCount: 0,
    errorCount: 0,
    inputTokenEstimate: 0,
    outputTokenEstimate: 0
  };
}

async function getDocument<T>(firestore: FirestoreLike, path: string): Promise<T | undefined> {
  const snapshot = await firestore.doc(path).get();
  if (!snapshot.exists) return undefined;
  return cloneJson(snapshot.data()) as T;
}

async function listCollection<T>(firestore: FirestoreLike, path: string): Promise<T[]> {
  const snapshot = await firestore.collection(path).get();
  return snapshot.docs.map((doc) => cloneJson(doc.data()) as T);
}

async function queryCollection<T>(firestore: FirestoreLike, path: string, fieldPath: string, value: unknown): Promise<T[]> {
  const snapshot = await firestore.collection(path).where(fieldPath, "==", value).get();
  return snapshot.docs.map((doc) => cloneJson(doc.data()) as T);
}

function teacherPath(id: string): string {
  return `teachers/${id}`;
}

function chatbotPath(id: string): string {
  return `chatbots/${id}`;
}

function shareTokenPath(token: string): string {
  return `shareTokens/${token}`;
}

function usageMonthlyPath(teacherId: string, month: string, chatbotId: string): string {
  return `usageMonthly/${teacherId}_${month}_${chatbotId}`;
}

function adminLogPath(id: string): string {
  return `adminLogs/${id}`;
}

function providerErrorPath(id: string): string {
  return `providerErrors/${id}`;
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

  if (input.reason !== undefined) event.reason = input.reason;
  if (input.targetChatbotId !== undefined) event.targetChatbotId = input.targetChatbotId;
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

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function estimateCostKrw(estimatedCostUsd: number): number {
  if (estimatedCostUsd <= 0) return 0;
  return Math.max(1, Math.ceil(estimatedCostUsd * 1400));
}

function roundCurrency(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
