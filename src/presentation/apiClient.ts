import type { CreateChatbotInput, ManagedChatbot } from "../domain/chatbot/chatbotManagement.js";
import type { AiSettings } from "../domain/ai/aiSettings.js";
import type { AiModelOption } from "../domain/ai/modelCatalog.js";
import type { AdminActionLogEvent, IdentityTeacherAccount, RegisterLocalTeacherInput } from "../domain/identity/identityAccess.js";
import type { PasswordResetAction } from "../domain/identity/identityAccess.js";
import type { MonthlyUsageSummary } from "../domain/usage/usageAccounting.js";
import type { CurriculumChunk, CurriculumRecommendation } from "../domain/curriculum/curriculumRecommendation.js";

export interface ProviderErrorLogView {
  id: string;
  occurredAt: string;
  provider: string;
  message: string;
  status?: number;
  code?: string;
  teacherId?: string;
  chatbotId?: string;
}

export interface CurriculumRecommendationView extends CurriculumRecommendation {
  matchedTerms?: string[];
  score?: number;
  chunk: CurriculumChunk & {
    sectionPath?: string;
  };
}

export interface AiSettingsPayload {
  settings: AiSettings;
  models: AiModelOption[];
}

export interface SchoolSearchResult {
  schoolName: string;
  schoolKind: string;
  officeCode: string;
  standardSchoolCode: string;
  region: string;
  address?: string;
}

export type ApiAuthTokenProvider = () => Promise<string | null> | string | null;

let apiAuthTokenProvider: ApiAuthTokenProvider | null = null;

export function setApiAuthTokenProvider(provider: ApiAuthTokenProvider | null): void {
  apiAuthTokenProvider = provider;
}

export async function searchSchools(query: string): Promise<SchoolSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const payload = await requestJson<{ schools: SchoolSearchResult[] }>(`/api/schools/search?${params.toString()}`);
  return payload.schools;
}

export async function getAiSettings(): Promise<AiSettingsPayload> {
  return requestJson<AiSettingsPayload>("/api/admin/ai-settings");
}

export async function updateAiSettings(adminId: string, modelId: string): Promise<AiSettingsPayload> {
  return requestJson<AiSettingsPayload>("/api/admin/ai-settings", {
    method: "PATCH",
    body: JSON.stringify({ adminId, modelId })
  });
}

export async function listTeachers(): Promise<IdentityTeacherAccount[]> {
  const payload = await requestJson<{ teachers: IdentityTeacherAccount[] }>("/api/teachers");
  return payload.teachers;
}

export async function registerTeacher(input: RegisterLocalTeacherInput): Promise<IdentityTeacherAccount> {
  const payload = await requestJson<{ teacher: IdentityTeacherAccount }>("/api/teachers", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return payload.teacher;
}

export async function approveTeacher(teacherId: string, adminId: string): Promise<IdentityTeacherAccount> {
  const payload = await requestJson<{ teacher: IdentityTeacherAccount }>(`/api/admin/teachers/${teacherId}/approve`, {
    method: "POST",
    body: JSON.stringify({ adminId })
  });
  return payload.teacher;
}

export async function rejectTeacherAsAdmin(teacherId: string, adminId: string, reason: string): Promise<IdentityTeacherAccount> {
  const payload = await requestJson<{ teacher: IdentityTeacherAccount }>(`/api/admin/teachers/${teacherId}/reject`, {
    method: "POST",
    body: JSON.stringify({ adminId, reason })
  });
  return payload.teacher;
}

export async function sendTeacherPasswordResetEmail(teacherId: string, adminId: string): Promise<PasswordResetAction> {
  const payload = await requestJson<{ action: PasswordResetAction }>(`/api/admin/teachers/${teacherId}/password-reset`, {
    method: "POST",
    body: JSON.stringify({ adminId })
  });
  return payload.action;
}

export async function disableTeacherAsAdmin(teacherId: string, adminId: string): Promise<IdentityTeacherAccount> {
  const payload = await requestJson<{ teacher: IdentityTeacherAccount }>(`/api/admin/teachers/${teacherId}/disable`, {
    method: "POST",
    body: JSON.stringify({ adminId })
  });
  return payload.teacher;
}

export async function listChatbots(ownerTeacherId?: string): Promise<ManagedChatbot[]> {
  const query = ownerTeacherId ? `?ownerTeacherId=${encodeURIComponent(ownerTeacherId)}` : "";
  const payload = await requestJson<{ chatbots: ManagedChatbot[] }>(`/api/chatbots${query}`);
  return payload.chatbots;
}

export async function createChatbot(input: CreateChatbotInput): Promise<ManagedChatbot> {
  const payload = await requestJson<{ chatbot: ManagedChatbot }>("/api/chatbots", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return payload.chatbot;
}

export async function updateChatbot(
  chatbotId: string,
  actorTeacherId: string,
  patch: Partial<Omit<CreateChatbotInput, "ownerTeacherId">>
): Promise<ManagedChatbot> {
  const payload = await requestJson<{ chatbot: ManagedChatbot }>(`/api/chatbots/${chatbotId}`, {
    method: "PATCH",
    body: JSON.stringify({ actorTeacherId, patch })
  });
  return payload.chatbot;
}

export async function deleteChatbot(chatbotId: string, actorTeacherId: string): Promise<ManagedChatbot> {
  const payload = await requestJson<{ chatbot: ManagedChatbot }>(`/api/chatbots/${chatbotId}`, {
    method: "DELETE",
    body: JSON.stringify({ actorTeacherId })
  });
  return payload.chatbot;
}

export async function disableChatbotAsAdmin(chatbotId: string, adminId: string): Promise<ManagedChatbot> {
  const payload = await requestJson<{ chatbot: ManagedChatbot }>(`/api/admin/chatbots/${chatbotId}/disable`, {
    method: "POST",
    body: JSON.stringify({ adminId })
  });
  return payload.chatbot;
}

export async function enableShareLink(chatbotId: string, actorTeacherId: string, expiresAt?: string | null): Promise<ManagedChatbot> {
  const payload = await requestJson<{ chatbot: ManagedChatbot }>(`/api/chatbots/${chatbotId}/share`, {
    method: "POST",
    body: JSON.stringify({ actorTeacherId, expiresAt })
  });
  return payload.chatbot;
}

export async function getSharedChatbot(token: string): Promise<ManagedChatbot> {
  const payload = await requestJson<{ chatbot: ManagedChatbot }>(`/api/share/${encodeURIComponent(token)}`);
  return payload.chatbot;
}

export async function getCurriculumRecommendations(
  topic: string,
  filters: { schoolLevel?: string; gradeBand?: string; subject?: string } = {}
): Promise<CurriculumRecommendationView[]> {
  const params = new URLSearchParams({ topic });
  if (filters.schoolLevel) params.set("schoolLevel", filters.schoolLevel);
  if (filters.gradeBand) params.set("gradeBand", filters.gradeBand);
  if (filters.subject) params.set("subject", filters.subject);
  const payload = await requestJson<{ recommendations: CurriculumRecommendationView[] }>(`/api/curriculum/recommend?${params.toString()}`);
  return payload.recommendations;
}

export async function getUsageSummaries(): Promise<MonthlyUsageSummary[]> {
  const payload = await requestJson<{ summaries: MonthlyUsageSummary[] }>("/api/usage");
  return payload.summaries;
}

export async function getProviderErrorLogs(): Promise<ProviderErrorLogView[]> {
  const payload = await requestJson<{ logs: ProviderErrorLogView[] }>("/api/admin/provider-errors");
  return payload.logs;
}

export async function getAdminActionLogs(): Promise<AdminActionLogEvent[]> {
  const payload = await requestJson<{ logs: AdminActionLogEvent[] }>("/api/admin/action-logs");
  return payload.logs;
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = await buildRequestHeaders(init.headers);
  const response = await fetch(url, {
    ...init,
    headers
  });
  const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | T | null;

  if (!response.ok) {
    const errorPayload = isRecord(payload) ? payload : {};
    const message =
      typeof errorPayload.message === "string" && errorPayload.message
        ? errorPayload.message
        : typeof errorPayload.error === "string" && errorPayload.error
          ? errorPayload.error
          : "요청을 처리하지 못했습니다.";
    throw new Error(message);
  }

  return payload as T;
}

async function buildRequestHeaders(input: HeadersInit | undefined): Promise<Record<string, string>> {
  const headers = normalizeHeaders(input);
  if (!hasHeader(headers, "content-type")) {
    headers["Content-Type"] = "application/json; charset=utf-8";
  }

  const token = await apiAuthTokenProvider?.();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function normalizeHeaders(input: HeadersInit | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!input) return headers;

  if (input instanceof Headers) {
    input.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  }

  if (Array.isArray(input)) {
    for (const [key, value] of input) {
      headers[key] = value;
    }
    return headers;
  }

  return { ...input };
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const normalized = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === normalized);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
