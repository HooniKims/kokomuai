import type { ChatbotPolicyInput } from "../../domain/chatbot/types";
import { buildStudentSystemPrompt } from "../../domain/chatPolicy/buildStudentSystemPrompt";
import {
  classifyStudentMessage,
  createGuardrailReply,
  type ConversationGuardDecision
} from "../../domain/conversation/conversationGuard";
import {
  createUsageErrorEvent,
  createUsageEvent,
  type UsageAccountingEvent,
  type UsageErrorEvent,
  type UsageSurface
} from "../../domain/usage/usageAccounting";

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiChatProvider {
  complete(messages: AiChatMessage[], signal?: AbortSignal): Promise<string>;
}

export interface ConversationHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SendStudentMessageInput {
  message: string;
  history: ConversationHistoryMessage[];
  chatbot: ChatbotPolicyInput;
  teacherId: string;
  chatbotId: string;
  conversationId: string;
  surface: UsageSurface;
  now: string;
  usageEventId?: string;
  errorEventId?: string;
  signal?: AbortSignal;
}

export type SendStudentMessageResult =
  | {
      kind: "guardrail";
      assistantMessage: string;
      guardDecision: ConversationGuardDecision;
      usageEvent?: undefined;
      errorEvent?: undefined;
    }
  | {
      kind: "ai_response";
      assistantMessage: string;
      guardDecision: ConversationGuardDecision;
      usageEvent: UsageAccountingEvent;
      errorEvent?: undefined;
    }
  | {
      kind: "provider_error";
      assistantMessage: string;
      guardDecision: ConversationGuardDecision;
      usageEvent?: undefined;
      errorEvent: UsageErrorEvent;
    };

export async function sendStudentMessage(
  input: SendStudentMessageInput,
  dependencies: { provider: AiChatProvider; providerName?: string }
): Promise<SendStudentMessageResult> {
  const guardDecision = classifyStudentMessage(input.message, input.chatbot);

  if (guardDecision.blockAiCall) {
    return {
      kind: "guardrail",
      assistantMessage: createGuardrailReply(guardDecision, input.chatbot),
      guardDecision
    };
  }

  try {
    const assistantMessage = await dependencies.provider.complete(buildProviderMessages(input), input.signal);

    return {
      kind: "ai_response",
      assistantMessage,
      guardDecision,
      usageEvent: createUsageEvent({
        id: input.usageEventId ?? `usage-${input.now}`,
        teacherId: input.teacherId,
        chatbotId: input.chatbotId,
        conversationId: input.conversationId,
        occurredAt: input.now,
        surface: input.surface,
        inputText: input.message,
        outputText: assistantMessage,
        riskCodes: guardDecision.riskCodes
      })
    };
  } catch (error) {
    return {
      kind: "provider_error",
      assistantMessage: "응답을 불러오지 못했어요. 다시 보내 보거나 선생님께 알려 주세요.",
      guardDecision,
      errorEvent: createUsageErrorEvent({
        id: input.errorEventId ?? `error-${input.now}`,
        teacherId: input.teacherId,
        chatbotId: input.chatbotId,
        conversationId: input.conversationId,
        occurredAt: input.now,
        surface: input.surface,
        inputText: input.message,
        assistantText: "",
        errorCode: "provider_error",
        riskCodes: guardDecision.riskCodes,
        technical: {
          provider: dependencies.providerName ?? "lmstudio",
          status: extractStatus(error),
          code: extractCode(error)
        }
      })
    };
  }
}

function buildProviderMessages(input: SendStudentMessageInput): AiChatMessage[] {
  return [
    { role: "system", content: buildStudentSystemPrompt(input.chatbot) },
    ...input.history.slice(-8),
    { role: "user", content: input.message }
  ];
}

function extractStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error && typeof error.status === "number") {
    return error.status;
  }

  return undefined;
}

function extractCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }

  return undefined;
}
