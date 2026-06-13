import { describe, expect, it } from "vitest";
import { createChatUsageErrorEventFromRequest, createChatUsageEventFromRequest } from "../../server/chatUsage";

const chatbot = {
  id: "chatbot-1",
  ownerTeacherId: "teacher-1",
  schoolLevel: "middle",
  gradeBand: "1",
  subject: "국어",
  topic: "중1 국어 9품사에 대한 이해",
  learningGoal: "학생이 품사의 역할을 예문 속에서 구분하도록 돕는다.",
  hintStrength: "medium",
  persona: "질문으로 이끄는 국어 선생님"
} as const;

describe("chatUsage", () => {
  it("creates a student-share usage event from a streamed chat request without raw text", () => {
    const event = createChatUsageEventFromRequest(
      {
        message: "9품사가 무엇인지 예문으로 알고 싶어요.",
        history: [],
        chatbot,
        conversationId: "conversation-1",
        surface: "student_share"
      },
      {
        id: "usage-1",
        occurredAt: "2026-06-12T10:00:00.000Z",
        assistantText: "좋아요. 먼저 문장에서 단어가 어떤 역할을 하는지 같이 살펴볼까요?",
        riskCodes: ["answer_request"],
        modelId: "lmstudio:gemma-4-12b-it"
      }
    );

    expect(event).toMatchObject({
      id: "usage-1",
      kind: "ai_call",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      conversationId: "conversation-1",
      surface: "student_share",
      month: "2026-06",
      provider: "lmstudio",
      modelId: "lmstudio:gemma-4-12b-it",
      estimatedCostUsd: 0,
      riskCodes: ["answer_request"]
    });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("9품사");
    expect(serialized).not.toContain("문장에서 단어");
  });

  it("does not create usage when chatbot identity metadata is missing", () => {
    const event = createChatUsageEventFromRequest(
      {
        message: "질문입니다.",
        history: [],
        chatbot: {
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "국어",
          topic: "중1 국어 9품사에 대한 이해",
          learningGoal: "학생이 품사의 역할을 예문 속에서 구분하도록 돕는다.",
          hintStrength: "medium",
          persona: "질문으로 이끄는 국어 선생님"
        }
      },
      {
        id: "usage-1",
        occurredAt: "2026-06-12T10:00:00.000Z",
        assistantText: "응답입니다.",
        riskCodes: []
      }
    );

    expect(event).toBeUndefined();
  });

  it("creates a provider error usage event without raw student text", () => {
    const event = createChatUsageErrorEventFromRequest(
      {
        message: "학생 질문 원문입니다.",
        history: [],
        chatbot,
        conversationId: "conversation-1",
        surface: "student_share"
      },
      {
        id: "usage-error-1",
        occurredAt: "2026-06-13T06:12:00.000Z",
        assistantText: "",
        riskCodes: [],
        modelId: "openai:gpt-5.4-nano",
        errorCode: "HTTP_503",
        technical: {
          provider: "openai",
          status: 503,
          code: "HTTP_503"
        }
      }
    );

    expect(event).toMatchObject({
      id: "usage-error-1",
      kind: "error",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      conversationId: "conversation-1",
      month: "2026-06",
      provider: "openai",
      modelId: "openai:gpt-5.4-nano",
      errorCode: "HTTP_503",
      inputTextLength: 12,
      assistantTextLength: 0,
      technical: {
        provider: "openai",
        status: 503,
        code: "HTTP_503"
      }
    });
    expect(JSON.stringify(event)).not.toContain("학생 질문 원문");
  });
});
