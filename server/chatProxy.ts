import { buildStudentSystemPrompt } from "../src/domain/chatPolicy/buildStudentSystemPrompt.js";
import type { ChatbotPolicyInput } from "../src/domain/chatbot/types.js";
import {
  classifyStudentMessage,
  createGuardrailReply,
  type ConversationGuardDecision,
} from "../src/domain/conversation/conversationGuard.js";
import { detectPrivacyRisks } from "../src/domain/privacy/privacyFilter.js";
import type { UsageSurface } from "../src/domain/usage/usageAccounting.js";

export interface ChatRequest {
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  chatbot: ChatbotPolicyInput & {
    id?: string;
    ownerTeacherId?: string;
  };
  shareToken?: string;
  conversationId?: string;
  surface?: UsageSurface;
}

export type LmStudioMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatResponsePlan =
  | {
      kind: "provider";
      messages: LmStudioMessage[];
      guardDecision: ConversationGuardDecision;
    }
  | {
      kind: "guardrail";
      assistantMessage: string;
      guardDecision: ConversationGuardDecision;
    }
  | {
      kind: "json_error";
      status: number;
      payload: {
        error: string;
        message: string;
        risks?: string[];
      };
    };

const maxCurrentMessageCharacters = 2400;
const maxHistoryMessageCharacters = 800;

export function createChatResponsePlan(
  requestBody: ChatRequest,
): ChatResponsePlan {
  if (requestBody.message.length > maxCurrentMessageCharacters) {
    return {
      kind: "json_error",
      status: 413,
      payload: {
        error: "message_too_long",
        message:
          "질문이 너무 깁니다. 핵심 질문만 짧게 정리해 다시 보내 주세요.",
      },
    };
  }

  const guardDecision = classifyStudentMessage(
    requestBody.message,
    requestBody.chatbot,
  );

  if (guardDecision.kind === "privacy_risk") {
    return {
      kind: "json_error",
      status: 422,
      payload: {
        error: "privacy_risk",
        message:
          "개인정보로 보이는 내용이 있어요. 이름, 학번, 전화번호, 주소 같은 정보는 빼고 다시 적어 주세요.",
        risks: guardDecision.riskCodes,
      },
    };
  }

  if (guardDecision.blockAiCall) {
    return {
      kind: "guardrail",
      assistantMessage: createGuardrailReply(
        guardDecision,
        requestBody.chatbot,
      ),
      guardDecision,
    };
  }

  const safeHistory = requestBody.history
    .slice(-8)
    .filter((message) => !detectPrivacyRisks(message.content).blocked)
    .map((message) => ({
      ...message,
      content: clipText(message.content, maxHistoryMessageCharacters),
    }));

  return {
    kind: "provider",
    guardDecision,
    messages: [
      {
        role: "system",
        content: buildStudentSystemPrompt(requestBody.chatbot),
      },
      ...safeHistory,
      { role: "user", content: requestBody.message },
    ],
  };
}

function clipText(value: string, maxCharacters: number): string {
  if (value.length <= maxCharacters) return value;
  return `${value.slice(0, maxCharacters)}...`;
}
