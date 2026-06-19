import type { ChatRequest } from "./chatProxy.js";
import {
  createUsageErrorEvent,
  createUsageEvent,
  type UsageAccountingEvent,
  type UsageSurface,
  type UsageTechnicalMetadata
} from "../src/domain/usage/usageAccounting.js";

interface ChatbotUsageIdentity {
  id?: string;
  ownerTeacherId?: string;
}

export interface CreateChatUsageOptions {
  id: string;
  occurredAt: string;
  assistantText: string;
  riskCodes: string[];
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}

export function createChatUsageEventFromRequest(
  requestBody: ChatRequest,
  options: CreateChatUsageOptions
): UsageAccountingEvent | undefined {
  const identity = requestBody.chatbot as ChatRequest["chatbot"] & ChatbotUsageIdentity;
  if (!identity.id || !identity.ownerTeacherId) {
    return undefined;
  }

  return createUsageEvent({
    id: options.id,
    teacherId: identity.ownerTeacherId,
    chatbotId: identity.id,
    conversationId: requestBody.conversationId,
    occurredAt: options.occurredAt,
    surface: requestBody.surface ?? "student_share",
    inputText: requestBody.message,
    outputText: options.assistantText,
    modelId: options.modelId,
    inputTokens: options.inputTokens,
    outputTokens: options.outputTokens,
    cachedInputTokens: options.cachedInputTokens,
    riskCodes: options.riskCodes
  });
}

export function createChatUsageErrorEventFromRequest(
  requestBody: ChatRequest,
  options: CreateChatUsageOptions & {
    errorCode: string;
    technical?: UsageTechnicalMetadata;
  }
): UsageAccountingEvent | undefined {
  const identity = requestBody.chatbot as ChatRequest["chatbot"] & ChatbotUsageIdentity;
  if (!identity.id || !identity.ownerTeacherId) {
    return undefined;
  }

  return createUsageErrorEvent({
    id: options.id,
    teacherId: identity.ownerTeacherId,
    chatbotId: identity.id,
    conversationId: requestBody.conversationId,
    occurredAt: options.occurredAt,
    surface: requestBody.surface ?? "student_share",
    inputText: requestBody.message,
    assistantText: options.assistantText,
    modelId: options.modelId,
    inputTokens: options.inputTokens,
    outputTokens: options.outputTokens,
    cachedInputTokens: options.cachedInputTokens,
    errorCode: options.errorCode,
    riskCodes: options.riskCodes,
    technical: options.technical
  });
}

export function normalizeUsageSurface(surface: UsageSurface | undefined): UsageSurface {
  return surface ?? "student_share";
}
