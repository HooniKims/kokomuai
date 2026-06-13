import { describe, expect, it } from "vitest";
import { resolveCurriculumRecommendationState } from "../../src/presentation/curriculumRecommendationState";
import { teacherChatbotSample } from "../../src/presentation/teacherChatbotSample";

describe("resolveCurriculumRecommendationState", () => {
  it("uses the Korean sample subject only for the untouched initial placeholder state", () => {
    expect(
      resolveCurriculumRecommendationState(
        {
          name: "",
          schoolLevel: teacherChatbotSample.schoolLevel,
          topic: "",
          learningGoal: "",
          subject: "",
          gradeBand: "",
          persona: "",
          hintStrength: teacherChatbotSample.hintStrength
        },
        teacherChatbotSample
      )
    ).toMatchObject({
      query: teacherChatbotSample.topic,
      schoolLevel: "middle",
      gradeBand: "1",
      subject: "국어"
    });
  });

  it("does not keep the Korean sample subject after the teacher changes school level", () => {
    expect(
      resolveCurriculumRecommendationState(
        {
          name: "",
          schoolLevel: "vocational_high",
          topic: "",
          learningGoal: "",
          subject: "",
          gradeBand: "",
          persona: "",
          hintStrength: teacherChatbotSample.hintStrength
        },
        teacherChatbotSample
      ).subject
    ).toBeUndefined();
  });
});
