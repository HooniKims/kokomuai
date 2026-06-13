import { describe, expect, it } from "vitest";
import { recommendCurriculum } from "../../src/domain/curriculum/curriculumRecommendation";

describe("curriculumRecommendation", () => {
  it("ranks only provided curriculum chunks and explains the recommendation simply", () => {
    const recommendations = recommendCurriculum({
      topic: "전기 회로에서 전구가 켜지는 조건",
      schoolLevel: "elementary",
      gradeBand: "5-6",
      chunks: [
        {
          id: "science-electric-circuit",
          sourceTitle: "2022 개정 과학과 교육과정 [별책9]",
          schoolLevel: "elementary",
          gradeBand: "5-6",
          subject: "과학",
          area: "전기와 자기",
          achievement: "전지, 전구, 전선을 연결하여 전구에 불이 켜지는 조건을 탐구한다.",
          excerpt: "전기 회로를 구성하고 전구가 켜지는 조건을 관찰한다."
        },
        {
          id: "math-fraction",
          sourceTitle: "2022 개정 수학과 교육과정 [별책8]",
          schoolLevel: "elementary",
          gradeBand: "5-6",
          subject: "수학",
          area: "수와 연산",
          achievement: "분수의 나눗셈 원리를 이해한다.",
          excerpt: "분수의 계산 원리를 탐구한다."
        }
      ]
    });

    expect(recommendations).toHaveLength(2);
    expect(recommendations[0].chunkId).toBe("science-electric-circuit");
    expect(recommendations[0].label).toBe("추천");
    expect(recommendations[0].reason).toContain("전기");
    expect(recommendations.map((item) => item.chunkId)).not.toContain("invented-standard");
  });

  it("filters fallback recommendations to the selected school level", () => {
    const recommendations = recommendCurriculum({
      topic: "전구 조건",
      schoolLevel: "high",
      gradeBand: "all",
      chunks: [
        {
          id: "science-elementary",
          sourceTitle: "초등 과학",
          schoolLevel: "elementary",
          gradeBand: "5-6",
          subject: "과학",
          area: "전기",
          achievement: "[6과15-01] 전구 조건을 탐구한다.",
          excerpt: "전구 조건"
        },
        {
          id: "science-high",
          sourceTitle: "고등 과학",
          schoolLevel: "high",
          gradeBand: "all",
          subject: "과학",
          area: "전기",
          achievement: "[12과01-01] 전기 조건을 분석한다.",
          excerpt: "전구 조건"
        }
      ]
    });

    expect(recommendations.map((recommendation) => recommendation.chunkId)).toEqual(["science-high"]);
  });
});
