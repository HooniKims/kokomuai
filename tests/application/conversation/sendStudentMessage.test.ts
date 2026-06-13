import { describe, expect, it } from "vitest";
import { sendStudentMessage, type AiChatProvider } from "../../../src/application/conversation/sendStudentMessage";
import type { ChatbotPolicyInput } from "../../../src/domain/chatbot/types";

const chatbot: ChatbotPolicyInput = {
  schoolLevel: "elementary",
  gradeBand: "5-6",
  subject: "과학",
  topic: "전기 회로에서 전구가 켜지는 조건",
  learningGoal: "학생이 닫힌 회로 조건을 스스로 설명하도록 돕는다.",
  hintStrength: "medium",
  persona: "친절하지만 답을 바로 말하지 않는 과학 선생님"
};

function createRecordingProvider(response = "전구가 켜지려면 연결이 끊기지 않았는지 먼저 살펴볼까요?") {
  const calls: Parameters<AiChatProvider["complete"]>[0][] = [];
  const provider: AiChatProvider = {
    async complete(messages) {
      calls.push(messages);
      return response;
    }
  };
  return { provider, calls };
}

describe("sendStudentMessage", () => {
  it("blocks privacy-risk messages before the provider is called", async () => {
    const { provider, calls } = createRecordingProvider();

    const result = await sendStudentMessage(
      {
        message: "제 번호는 010-1234-5678인데 전구가 안 켜져요.",
        history: [],
        chatbot,
        teacherId: "teacher-1",
        chatbotId: "chatbot-1",
        conversationId: "conversation-1",
        surface: "student_share",
        now: "2026-06-12T10:00:00.000Z"
      },
      { provider }
    );

    expect(result.kind).toBe("guardrail");
    expect(result.guardDecision.kind).toBe("privacy_risk");
    expect(result.assistantMessage).toContain("개인정보");
    expect(result.usageEvent).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("calls the provider with policy prompt and recent history for normal messages", async () => {
    const { provider, calls } = createRecordingProvider("좋아요. 먼저 전선이 전구 양쪽에 이어져 있는지 볼까요?");

    const result = await sendStudentMessage(
      {
        message: "전지랑 전선이 있는데 전구가 왜 안 켜질까요?",
        history: Array.from({ length: 10 }, (_, index) => ({
          role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
          content: `이전 대화 ${index}`
        })),
        chatbot,
        teacherId: "teacher-1",
        chatbotId: "chatbot-1",
        conversationId: "conversation-1",
        surface: "student_share",
        now: "2026-06-12T10:00:00.000Z",
        usageEventId: "usage-1"
      },
      { provider }
    );

    expect(result.kind).toBe("ai_response");
    expect(result.assistantMessage).toContain("전선");
    expect(calls).toHaveLength(1);
    expect(calls[0][0].role).toBe("system");
    expect(calls[0][0].content).toContain("정답을 바로 말하지 마세요");
    expect(calls[0]).toHaveLength(10);
    expect(calls[0].at(-1)).toEqual({
      role: "user",
      content: "전지랑 전선이 있는데 전구가 왜 안 켜질까요?"
    });
    expect(result.usageEvent).toMatchObject({
      id: "usage-1",
      kind: "ai_call",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      conversationId: "conversation-1",
      surface: "student_share"
    });
    expect(JSON.stringify(result.usageEvent)).not.toContain("전지랑 전선");
    expect(JSON.stringify(result.usageEvent)).not.toContain("전선이 전구");
  });

  it("records provider errors without storing raw student or assistant text", async () => {
    const provider: AiChatProvider = {
      async complete() {
        throw Object.assign(new Error("provider failed with raw prompt"), {
          code: "ECONNRESET",
          status: 502
        });
      }
    };

    const result = await sendStudentMessage(
      {
        message: "전지랑 전선이 있는데 전구가 왜 안 켜질까요?",
        history: [],
        chatbot,
        teacherId: "teacher-1",
        chatbotId: "chatbot-1",
        conversationId: "conversation-1",
        surface: "teacher_preview",
        now: "2026-06-12T10:00:00.000Z",
        errorEventId: "error-1"
      },
      { provider }
    );

    expect(result.kind).toBe("provider_error");
    expect(result.assistantMessage).toContain("응답을 불러오지 못했어요");
    expect(result.errorEvent).toMatchObject({
      id: "error-1",
      kind: "error",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      surface: "teacher_preview",
      errorCode: "provider_error",
      technical: {
        provider: "lmstudio",
        status: 502,
        code: "ECONNRESET"
      }
    });
    expect(JSON.stringify(result.errorEvent)).not.toContain("전지랑 전선");
    expect(JSON.stringify(result.errorEvent)).not.toContain("raw prompt");
  });
});
