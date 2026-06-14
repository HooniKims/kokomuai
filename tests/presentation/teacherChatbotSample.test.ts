import { describe, expect, it } from "vitest";
import { teacherChatbotSample } from "../../src/presentation/teacherChatbotSample";

describe("teacherChatbotSample", () => {
  it("uses a middle school Korean parts-of-speech example for teacher placeholders", () => {
    expect(teacherChatbotSample).toMatchObject({
      name: "국어 9품사 이해",
      schoolLevel: "middle",
      gradeBand: "1",
      subject: "국어"
    });
    expect(teacherChatbotSample.topic).toContain("품사");
    expect(teacherChatbotSample.learningGoal).toContain("명사");
    expect(teacherChatbotSample.persona).toContain("국어 선생님");
  });
});
