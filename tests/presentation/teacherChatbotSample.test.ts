import { describe, expect, it } from "vitest";
import { teacherChatbotSample } from "../../src/presentation/teacherChatbotSample";

describe("teacherChatbotSample", () => {
  it("uses a middle school Korean parts-of-speech example for teacher placeholders", () => {
    expect(teacherChatbotSample).toMatchObject({
      name: "국어 9품사 이해",
      schoolLevel: "middle",
      gradeBand: "1",
      subject: "국어",
      hintStrength: "low",
    });
    expect(teacherChatbotSample.topic).toContain("품사");
    expect(teacherChatbotSample.learningGoal).toContain("명사");
    expect(teacherChatbotSample.persona).toBe(
      "친절하지만 답을 바로 말하지 않고 예문과 질문으로 이끄는 선생님",
    );
  });
});
