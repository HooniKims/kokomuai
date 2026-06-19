import { calculateModelCostUsd, resolveAiModel, type AiProvider } from "../ai/modelCatalog.js";

export type UsageSurface = "student_share" | "teacher_preview";

export interface UsageTechnicalMetadata {
  provider?: string;
  status?: number;
  code?: string;
}

interface UsageEventBase {
  id: string;
  teacherId: string;
  chatbotId: string;
  conversationId?: string;
  occurredAt: string;
  month: string;
  surface: UsageSurface;
}

export interface AiCallUsageEvent extends UsageEventBase {
  kind: "ai_call";
  provider: AiProvider;
  modelId: string;
  inputTextLength: number;
  outputTextLength: number;
  inputTokenEstimate: number;
  outputTokenEstimate: number;
  estimatedCostUsd: number;
  riskCodes: string[];
}

export interface UsageErrorEvent extends UsageEventBase {
  kind: "error";
  provider?: AiProvider;
  modelId?: string;
  inputTextLength: number;
  assistantTextLength: number;
  inputTokenEstimate: number;
  outputTokenEstimate: number;
  estimatedCostUsd: number;
  errorCode: string;
  riskCodes: string[];
  technical?: UsageTechnicalMetadata;
}

export type UsageAccountingEvent = AiCallUsageEvent | UsageErrorEvent;

export interface SurfaceUsageSummary {
  conversationCount: number;
  aiCallCount: number;
  errorCount: number;
  inputTokenEstimate: number;
  outputTokenEstimate: number;
}

export interface MonthlyUsageSummary extends SurfaceUsageSummary {
  teacherId: string;
  chatbotId: string;
  month: string;
  estimatedCostUsd: number;
  estimatedCostKrw: number;
  surfaces: Record<UsageSurface, SurfaceUsageSummary>;
}

export interface CreateUsageEventInput {
  id: string;
  teacherId: string;
  chatbotId: string;
  conversationId?: string;
  occurredAt: string;
  surface: UsageSurface;
  inputText: string;
  outputText: string;
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  riskCodes?: string[];
}

export interface CreateUsageErrorEventInput {
  id: string;
  teacherId: string;
  chatbotId: string;
  conversationId?: string;
  occurredAt: string;
  surface: UsageSurface;
  inputText?: string;
  assistantText?: string;
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  errorCode: string;
  riskCodes?: string[];
  technical?: UsageTechnicalMetadata;
}

const estimatedKrwPerUsd = 1400;

interface InternalMonthlyUsageSummary extends SurfaceUsageSummary {
  teacherId: string;
  chatbotId: string;
  month: string;
  estimatedCostUsd: number;
  conversationIds: Set<string>;
  surfaceConversationIds: Record<UsageSurface, Set<string>>;
  surfaces: Record<UsageSurface, SurfaceUsageSummary>;
}

export function estimateTokensFromText(text: string): number {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return 0;
  let asciiRunLength = 0;
  let tokenEstimate = 0;

  for (const char of normalized) {
    if (/\s/.test(char)) {
      tokenEstimate += estimateAsciiRunTokens(asciiRunLength);
      asciiRunLength = 0;
      continue;
    }

    if (isCjkOrHangul(char)) {
      tokenEstimate += estimateAsciiRunTokens(asciiRunLength);
      asciiRunLength = 0;
      tokenEstimate += 1;
      continue;
    }

    asciiRunLength += char.length;
  }

  tokenEstimate += estimateAsciiRunTokens(asciiRunLength);
  return tokenEstimate;
}

export function createUsageEvent(input: CreateUsageEventInput): AiCallUsageEvent {
  const model = resolveAiModel(input.modelId);
  const inputTokenEstimate = input.inputTokens ?? estimateTokensFromText(input.inputText);
  const outputTokenEstimate = input.outputTokens ?? estimateTokensFromText(input.outputText);

  return {
    id: input.id,
    kind: "ai_call",
    provider: model.provider,
    modelId: model.id,
    teacherId: input.teacherId,
    chatbotId: input.chatbotId,
    conversationId: input.conversationId,
    occurredAt: input.occurredAt,
    month: monthFrom(input.occurredAt),
    surface: input.surface,
    inputTextLength: input.inputText.length,
    outputTextLength: input.outputText.length,
    inputTokenEstimate,
    outputTokenEstimate,
    estimatedCostUsd: calculateModelCostUsd(model, {
      inputTokens: inputTokenEstimate,
      outputTokens: outputTokenEstimate,
      cachedInputTokens: input.cachedInputTokens
    }),
    riskCodes: sanitizeCodes(input.riskCodes ?? [])
  };
}

export function createUsageErrorEvent(input: CreateUsageErrorEventInput): UsageErrorEvent {
  const inputText = input.inputText ?? "";
  const assistantText = input.assistantText ?? "";
  const model = input.modelId ? resolveAiModel(input.modelId) : undefined;
  const inputTokenEstimate = input.inputTokens ?? estimateTokensFromText(inputText);
  const outputTokenEstimate = input.outputTokens ?? estimateTokensFromText(assistantText);

  return {
    id: input.id,
    kind: "error",
    provider: model?.provider,
    modelId: model?.id,
    teacherId: input.teacherId,
    chatbotId: input.chatbotId,
    conversationId: input.conversationId,
    occurredAt: input.occurredAt,
    month: monthFrom(input.occurredAt),
    surface: input.surface,
    inputTextLength: inputText.length,
    assistantTextLength: assistantText.length,
    inputTokenEstimate,
    outputTokenEstimate,
    estimatedCostUsd: model
      ? calculateModelCostUsd(model, {
          inputTokens: inputTokenEstimate,
          outputTokens: outputTokenEstimate,
          cachedInputTokens: input.cachedInputTokens
        })
      : 0,
    errorCode: sanitizeCode(input.errorCode) || "unknown_error",
    riskCodes: sanitizeCodes(input.riskCodes ?? []),
    technical: sanitizeTechnicalMetadata(input.technical)
  };
}

export function aggregateUsageByMonth(events: UsageAccountingEvent[]): MonthlyUsageSummary[] {
  const grouped = new Map<string, InternalMonthlyUsageSummary>();

  for (const event of events) {
    const key = `${event.teacherId}:${event.chatbotId}:${event.month}`;
    const summary = grouped.get(key) ?? createEmptyMonthlySummary(event.teacherId, event.chatbotId, event.month);
    grouped.set(key, summary);

    const conversationKey = event.conversationId ?? (event.kind === "ai_call" ? `ai_call:${event.id}` : undefined);
    if (conversationKey) {
      summary.conversationIds.add(conversationKey);
      summary.surfaceConversationIds[event.surface].add(conversationKey);
    }

    if (event.kind === "ai_call") {
      addAiCall(summary, event);
      summary.estimatedCostUsd += event.estimatedCostUsd;
      addAiCall(summary.surfaces[event.surface], event);
    } else {
      summary.estimatedCostUsd += event.estimatedCostUsd;
      summary.errorCount += 1;
      summary.surfaces[event.surface].errorCount += 1;
    }
  }

  return Array.from(grouped.values())
    .map(toMonthlyUsageSummary)
    .sort((left, right) => {
      const leftKey = `${left.teacherId}:${left.chatbotId}:${left.month}`;
      const rightKey = `${right.teacherId}:${right.chatbotId}:${right.month}`;
      return leftKey.localeCompare(rightKey);
    });
}

function monthFrom(occurredAt: string): string {
  const match = /^\d{4}-\d{2}/.exec(occurredAt);
  if (!match) {
    throw new Error("occurredAt must start with YYYY-MM");
  }
  return match[0];
}

function sanitizeCodes(codes: string[]): string[] {
  return codes.map(sanitizeCode).filter((code) => code.length > 0);
}

function sanitizeCode(code: string): string {
  return code.trim().replace(/[^\w.-]/g, "_").slice(0, 80);
}

function sanitizeTechnicalMetadata(technical: UsageTechnicalMetadata | undefined): UsageTechnicalMetadata | undefined {
  if (!technical) return undefined;

  const sanitized: UsageTechnicalMetadata = {};
  if (technical.provider) sanitized.provider = sanitizeCode(technical.provider);
  if (typeof technical.status === "number") sanitized.status = technical.status;
  if (technical.code) sanitized.code = sanitizeCode(technical.code);

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function createEmptySurfaceSummary(): SurfaceUsageSummary {
  return {
    conversationCount: 0,
    aiCallCount: 0,
    errorCount: 0,
    inputTokenEstimate: 0,
    outputTokenEstimate: 0
  };
}

function createEmptyMonthlySummary(teacherId: string, chatbotId: string, month: string): InternalMonthlyUsageSummary {
  return {
    teacherId,
    chatbotId,
    month,
    conversationCount: 0,
    aiCallCount: 0,
    errorCount: 0,
    inputTokenEstimate: 0,
    outputTokenEstimate: 0,
    estimatedCostUsd: 0,
    conversationIds: new Set<string>(),
    surfaceConversationIds: {
      student_share: new Set<string>(),
      teacher_preview: new Set<string>()
    },
    surfaces: {
      student_share: createEmptySurfaceSummary(),
      teacher_preview: createEmptySurfaceSummary()
    }
  };
}

function addAiCall(summary: SurfaceUsageSummary, event: AiCallUsageEvent): void {
  summary.aiCallCount += 1;
  summary.inputTokenEstimate += event.inputTokenEstimate;
  summary.outputTokenEstimate += event.outputTokenEstimate;
}

function toMonthlyUsageSummary(summary: InternalMonthlyUsageSummary): MonthlyUsageSummary {
  const studentShare = {
    ...summary.surfaces.student_share,
    conversationCount: summary.surfaceConversationIds.student_share.size
  };
  const teacherPreview = {
    ...summary.surfaces.teacher_preview,
    conversationCount: summary.surfaceConversationIds.teacher_preview.size
  };

  return {
    teacherId: summary.teacherId,
    chatbotId: summary.chatbotId,
    month: summary.month,
    conversationCount: summary.conversationIds.size,
    aiCallCount: summary.aiCallCount,
    errorCount: summary.errorCount,
    inputTokenEstimate: summary.inputTokenEstimate,
    outputTokenEstimate: summary.outputTokenEstimate,
    estimatedCostUsd: roundCurrency(summary.estimatedCostUsd),
    estimatedCostKrw: estimateKrwCostFromUsd(summary.estimatedCostUsd),
    surfaces: {
      student_share: studentShare,
      teacher_preview: teacherPreview
    }
  };
}

export function estimateKrwCostFromUsd(estimatedCostUsd: number): number {
  if (estimatedCostUsd <= 0) return 0;
  const cost = estimatedCostUsd * estimatedKrwPerUsd;
  if (cost < 0.01) return 0.01;
  return Math.round(cost * 100) / 100;
}

function roundCurrency(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function estimateAsciiRunTokens(length: number): number {
  return length > 0 ? Math.ceil(length / 4) : 0;
}

function isCjkOrHangul(char: string): boolean {
  return /[\u1100-\u11ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/u.test(char);
}
