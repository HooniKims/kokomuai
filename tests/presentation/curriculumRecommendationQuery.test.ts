import { describe, expect, it } from "vitest";
import { buildCurriculumRecommendationQuery } from "../../src/presentation/curriculumRecommendationQuery";

describe("buildCurriculumRecommendationQuery", () => {
  it("uses chatbot name, subject, topic, and learning goal for live curriculum recommendations", () => {
    expect(
      buildCurriculumRecommendationQuery({
        name: "직업 생활 AI 코치",
        subject: "경영·금융 전문 교과",
        topic: "면접 준비 전략",
        learningGoal: "학생이 면접 이미지 메이킹과 준비 절차를 설명하도록 돕는다."
      })
    ).toBe("직업 생활 AI 코치 경영·금융 전문 교과 면접 준비 전략 학생이 면접 이미지 메이킹과 준비 절차를 설명하도록 돕는다.");
  });

  it("falls back to the demo topic only when every recommendation field is empty", () => {
    expect(
      buildCurriculumRecommendationQuery(
        {
          name: "",
          subject: "",
          topic: "",
          learningGoal: ""
        },
        "전기 회로에서 전구가 켜지는 조건"
      )
    ).toBe("전기 회로에서 전구가 켜지는 조건");
  });
});
