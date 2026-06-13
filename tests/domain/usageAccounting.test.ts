import { describe, expect, it } from "vitest";
import {
  aggregateUsageByMonth,
  createUsageErrorEvent,
  createUsageEvent,
  estimateTokensFromText,
  type UsageAccountingEvent
} from "../../src/domain/usage/usageAccounting";

describe("usageAccounting", () => {
  it("creates an AI call usage event with estimates without storing student or assistant raw text", () => {
    const studentText = "전구 실험에서 제 질문 원문은 왜 불이 안 켜지는지예요.";
    const assistantText = "회로가 이어졌는지부터 살펴보자는 assistant 응답 원문입니다.";

    const event = createUsageEvent({
      id: "usage-1",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      conversationId: "conversation-1",
      occurredAt: "2026-06-12T10:00:00.000Z",
      surface: "student_share",
      inputText: studentText,
      outputText: assistantText
    });

    expect(event).toMatchObject({
      id: "usage-1",
      kind: "ai_call",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      conversationId: "conversation-1",
      month: "2026-06",
      surface: "student_share",
      inputTextLength: studentText.length,
      outputTextLength: assistantText.length,
      inputTokenEstimate: estimateTokensFromText(studentText),
      outputTokenEstimate: estimateTokensFromText(assistantText)
    });

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("제 질문 원문");
    expect(serialized).not.toContain("assistant 응답 원문");
    expect(serialized).not.toContain(studentText);
    expect(serialized).not.toContain(assistantText);
  });

  it("creates an error event with allowed technical metadata but no raw text", () => {
    const event = createUsageErrorEvent({
      id: "error-1",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      conversationId: "conversation-1",
      occurredAt: "2026-06-12T10:01:00.000Z",
      surface: "teacher_preview",
      inputText: "학생 원문 개인정보 010-1234-5678",
      assistantText: "assistant 원문 일부",
      errorCode: "provider_error",
      riskCodes: ["phone"],
      technical: {
        provider: "lmstudio",
        status: 502,
        code: "ECONNRESET"
      }
    });

    expect(event).toMatchObject({
      id: "error-1",
      kind: "error",
      month: "2026-06",
      surface: "teacher_preview",
      errorCode: "provider_error",
      riskCodes: ["phone"],
      technical: {
        provider: "lmstudio",
        status: 502,
        code: "ECONNRESET"
      }
    });

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("학생 원문");
    expect(serialized).not.toContain("010-1234-5678");
    expect(serialized).not.toContain("assistant 원문");
  });

  it("aggregates AI calls, token estimates, errors, and surfaces by teacher, chatbot, and month", () => {
    const studentShare = createUsageEvent({
      id: "usage-1",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      conversationId: "conversation-1",
      occurredAt: "2026-06-12T10:00:00.000Z",
      surface: "student_share",
      inputText: "학생 공유 질문",
      outputText: "학생 공유 응답"
    });
    const teacherPreview = createUsageEvent({
      id: "usage-2",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      conversationId: "conversation-2",
      occurredAt: "2026-06-20T10:00:00.000Z",
      surface: "teacher_preview",
      inputText: "교사 미리보기 질문",
      outputText: "교사 미리보기 응답"
    });
    const providerError = createUsageErrorEvent({
      id: "error-1",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      conversationId: "conversation-1",
      occurredAt: "2026-06-20T10:01:00.000Z",
      surface: "student_share",
      inputText: "오류가 난 질문",
      errorCode: "provider_error",
      technical: { provider: "lmstudio", status: 502, code: "BAD_GATEWAY" }
    });
    const otherMonth = createUsageEvent({
      id: "usage-3",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      conversationId: "conversation-3",
      occurredAt: "2026-07-01T10:00:00.000Z",
      surface: "student_share",
      inputText: "다음 달 질문",
      outputText: "다음 달 응답"
    });

    const summaries = aggregateUsageByMonth([studentShare, teacherPreview, providerError, otherMonth] satisfies UsageAccountingEvent[]);
    const june = summaries.find((summary) => summary.teacherId === "teacher-1" && summary.chatbotId === "chatbot-1" && summary.month === "2026-06");

    expect(june).toMatchObject({
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      month: "2026-06",
      conversationCount: 2,
      aiCallCount: 2,
      errorCount: 1,
      inputTokenEstimate: studentShare.inputTokenEstimate + teacherPreview.inputTokenEstimate,
      outputTokenEstimate: studentShare.outputTokenEstimate + teacherPreview.outputTokenEstimate,
      surfaces: {
        student_share: {
          conversationCount: 1,
          aiCallCount: 1,
          errorCount: 1
        },
        teacher_preview: {
          conversationCount: 1,
          aiCallCount: 1,
          errorCount: 0
        }
      }
    });
    expect(june?.estimatedCostKrw).toBe(0);
  });

  it("uses model pricing and explicit provider token counts when available", () => {
    const openAiCall = createUsageEvent({
      id: "usage-openai",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      conversationId: "conversation-openai",
      occurredAt: "2026-06-12T10:00:00.000Z",
      surface: "student_share",
      inputText: "원문은 저장하지 않는다",
      outputText: "응답 원문도 저장하지 않는다",
      modelId: "openai:gpt-5.4-nano",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000
    });
    const localCall = createUsageEvent({
      id: "usage-local",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      conversationId: "conversation-local",
      occurredAt: "2026-06-12T10:05:00.000Z",
      surface: "teacher_preview",
      inputText: "로컬 질문",
      outputText: "로컬 응답",
      modelId: "lmstudio:gemma-4-12b-it",
      inputTokens: 500_000,
      outputTokens: 250_000
    });

    const [summary] = aggregateUsageByMonth([openAiCall, localCall]);

    expect(openAiCall).toMatchObject({
      provider: "openai",
      modelId: "openai:gpt-5.4-nano",
      inputTokenEstimate: 1_000_000,
      outputTokenEstimate: 1_000_000,
      estimatedCostUsd: 1.45
    });
    expect(localCall).toMatchObject({
      provider: "lmstudio",
      modelId: "lmstudio:gemma-4-12b-it",
      inputTokenEstimate: 500_000,
      outputTokenEstimate: 250_000,
      estimatedCostUsd: 0
    });
    expect(summary).toMatchObject({
      inputTokenEstimate: 1_500_000,
      outputTokenEstimate: 1_250_000,
      estimatedCostUsd: 1.45
    });
  });
});
