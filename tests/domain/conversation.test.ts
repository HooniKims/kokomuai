import { describe, expect, it } from "vitest";
import { buildOpeningMessage, summarizeLongStudentInput } from "../../src/domain/conversation/conversationPolicy";

describe("conversationPolicy", () => {
  it("builds an opening message that waits for the student question", () => {
    const message = buildOpeningMessage({
      schoolLevel: "elementary",
      topic: "전기 회로"
    });

    expect(message).toContain("궁금한 점");
    expect(message).toContain("함께");
    expect(message).not.toContain("?");
  });

  it("summarizes long student input without losing the original question direction", () => {
    const result = summarizeLongStudentInput(
      "전구 실험을 했는데 어떤 모둠은 불이 켜지고 어떤 모둠은 안 켜졌어요. 전선을 바꿨는데도 안 되는 경우가 있었고 전지는 새것이었어요. 왜 그런지 모르겠어요."
    );

    expect(result.shouldSummarize).toBe(true);
    expect(result.summary).toContain("전구");
    expect(result.summary).toContain("켜지");
  });
});
