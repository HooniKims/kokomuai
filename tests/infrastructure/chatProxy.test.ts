import { describe, expect, it } from "vitest";
import { createChatResponsePlan } from "../../server/chatProxy";

const chatbot = {
  schoolLevel: "elementary",
  gradeBand: "5-6",
  subject: "과학",
  topic: "물의 상태 변화",
  learningGoal: "학생이 물의 상태 변화를 관찰 근거로 설명하도록 돕는다.",
  hintStrength: "medium",
  persona: "답을 바로 말하지 않고 질문으로 사고를 돕는 과학 선생님"
} as const;

describe("chatProxy", () => {
  it("blocks the current message before provider calls when it contains private text", () => {
    const prepared = createChatResponsePlan({
      message: "제 전화번호는 010-1234-5678이에요.",
      history: [],
      chatbot
    });

    expect(prepared.kind).toBe("json_error");
    if (prepared.kind === "json_error") {
      expect(prepared.status).toBe(422);
      expect(prepared.payload.error).toBe("privacy_risk");
      expect(JSON.stringify(prepared.payload)).not.toContain("010-1234-5678");
    }
  });

  it("removes private text from conversation history before provider calls", () => {
    const prepared = createChatResponsePlan({
      message: "그럼 전구와 전선은 어떻게 연결해야 할까?",
      history: [
        { role: "user", content: "제 이메일은 child@example.com 입니다." },
        { role: "assistant", content: "개인정보는 빼고 질문해 보자." },
        { role: "user", content: "물이 얼면 어떤 점이 달라져?" }
      ],
      chatbot
    });

    expect(prepared.kind).toBe("provider");
    if (prepared.kind === "provider") {
      const serialized = JSON.stringify(prepared.messages);
      expect(serialized).toContain("물이 얼면 어떤 점이 달라져?");
      expect(serialized).toContain("그럼 전구와 전선은 어떻게 연결해야 할까?");
      expect(serialized).not.toContain("child@example.com");
    }
  });

  it("rejects unusually long current messages before provider calls", () => {
    const prepared = createChatResponsePlan({
      message: "가".repeat(2401),
      history: [],
      chatbot
    });

    expect(prepared.kind).toBe("json_error");
    if (prepared.kind === "json_error") {
      expect(prepared.status).toBe(413);
      expect(prepared.payload).toEqual({
        error: "message_too_long",
        message: "질문이 너무 깁니다. 핵심 질문만 짧게 정리해 다시 보내 주세요."
      });
      expect(JSON.stringify(prepared.payload)).not.toContain("가".repeat(100));
    }
  });

  it("clips oversized history messages before provider calls", () => {
    const prepared = createChatResponsePlan({
      message: "상태 변화의 예를 하나만 더 생각해 볼래?",
      history: [{ role: "user", content: `앞 질문 ${"가".repeat(2000)}` }],
      chatbot
    });

    expect(prepared.kind).toBe("provider");
    if (prepared.kind === "provider") {
      expect(prepared.messages[1].content.length).toBeLessThanOrEqual(803);
      expect(prepared.messages[1].content).toMatch(/...$/);
      expect(prepared.messages[1].content).not.toContain("가".repeat(1000));
    }
  });

  it("returns a local guardrail reply without provider messages for out-of-scope questions", () => {
    const prepared = createChatResponsePlan({
      message: "세종대왕의 업적을 알려줘.",
      history: [],
      chatbot
    });

    expect(prepared.kind).toBe("guardrail");
    if (prepared.kind === "guardrail") {
      expect(prepared.assistantMessage).toContain("범위 안에서만");
      expect(prepared.guardDecision.kind).toBe("out_of_scope");
    }
  });

  it("keeps answer requests inside the policy prompt instead of treating them as normal messages", () => {
    const prepared = createChatResponsePlan({
      message: "정답만 빨리 알려줘.",
      history: [],
      chatbot
    });

    expect(prepared.kind).toBe("provider");
    if (prepared.kind === "provider") {
      expect(prepared.guardDecision.kind).toBe("answer_request");
      expect(prepared.messages[0].content).toContain("정답을 바로 말하지 마세요");
    }
  });
});
