import type { AiSettings } from "../src/domain/ai/aiSettings";
import type { ManagedChatbot } from "../src/domain/chatbot/chatbotManagement";
import type { AdminActionLogEvent, IdentityTeacherAccount } from "../src/domain/identity/identityAccess";
import type { MonthlyUsageSummary, UsageAccountingEvent, UsageSurface } from "../src/domain/usage/usageAccounting";

export const storePortContractVersion = 2;

export interface ProviderErrorLogEntry {
  id: string;
  occurredAt: string;
  provider: string;
  message: string;
  status?: number;
  code?: string;
  teacherId?: string;
  chatbotId?: string;
  surface?: UsageSurface;
  riskCodes?: string[];
}

export interface StorePort {
  listTeachers(): Promise<IdentityTeacherAccount[]>;
  getTeacher(id: string): Promise<IdentityTeacherAccount | undefined>;
  saveTeacher(teacher: IdentityTeacherAccount): Promise<void>;
  saveTeacherIfEmailAbsent(teacher: IdentityTeacherAccount): Promise<{ teacher: IdentityTeacherAccount; created: boolean }>;
  updateTeacherWithAdminAction(
    teacherId: string,
    update: (teacher: IdentityTeacherAccount) => { teacher: IdentityTeacherAccount; event?: AdminActionLogEvent }
  ): Promise<{ teacher: IdentityTeacherAccount; event?: AdminActionLogEvent } | undefined>;
  listChatbots(): Promise<ManagedChatbot[]>;
  listChatbotsByOwner(ownerTeacherId: string): Promise<ManagedChatbot[]>;
  getChatbot(id: string): Promise<ManagedChatbot | undefined>;
  saveChatbot(chatbot: ManagedChatbot): Promise<void>;
  findChatbotByShareToken(token: string): Promise<ManagedChatbot | undefined>;
  appendUsageEvent(event: UsageAccountingEvent): Promise<void>;
  listUsageEvents(): Promise<UsageAccountingEvent[]>;
  listUsageSummaries(): Promise<MonthlyUsageSummary[]>;
  listUsageSummariesByTeacher(teacherId: string): Promise<MonthlyUsageSummary[]>;
  getAiSettings(): Promise<AiSettings>;
  saveAiSettings(settings: AiSettings): Promise<void>;
  appendAdminActionLog(event: AdminActionLogEvent | (AdminActionLogEvent & Record<string, unknown>)): Promise<void>;
  listAdminActionLogs(): Promise<AdminActionLogEvent[]>;
  appendProviderErrorLog(event: ProviderErrorLogEntry | (ProviderErrorLogEntry & Record<string, unknown>)): Promise<void>;
  listProviderErrorLogs(): Promise<ProviderErrorLogEntry[]>;
}
