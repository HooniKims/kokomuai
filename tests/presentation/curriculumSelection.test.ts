import { describe, expect, it } from "vitest";
import {
  getVisibleCurriculumRecommendations,
  formatCurriculumSelectionStatus,
  mergePinnedCurriculumRecommendations,
  resolveSelectedCurriculumRecommendations,
  toggleCurriculumSelection,
  toCurriculumLink
} from "../../src/presentation/curriculumSelection";
import type { CurriculumRecommendationView } from "../../src/presentation/apiClient";

const recommendations: CurriculumRecommendationView[] = [
  recommendation("korean-grammar", "[9국04-03] 품사의 종류와 특성을 이해한다."),
  recommendation("korean-writing", "[9국03-01] 설명 방법을 활용해 글을 쓴다."),
  recommendation("korean-literature", "[9국05-01] 작품을 감상한다."),
  recommendation("korean-media", "[9국06-01] 매체 특성을 비교한다.")
];

describe("curriculumSelection", () => {
  it("uses every explicitly selected recommendation when the teacher chooses multiple standards", () => {
    expect(resolveSelectedCurriculumRecommendations(recommendations, ["korean-writing", "korean-literature"]).map((item) => item.chunkId)).toEqual([
      "korean-writing",
      "korean-literature"
    ]);
  });

  it("keeps selected recommendations pinned when the recommendation query changes", () => {
    const nextRecommendations = [recommendation("math-linear-function", "[9수03-04] 일차함수를 이해하고 그래프로 나타낸다.")];

    expect(
      resolveSelectedCurriculumRecommendations(nextRecommendations, ["korean-writing"], [recommendations[1]]).map((item) => item.chunkId)
    ).toEqual(["korean-writing"]);
    expect(mergePinnedCurriculumRecommendations(nextRecommendations, [recommendations[1]], ["korean-writing"]).map((item) => item.chunkId)).toEqual([
      "korean-writing",
      "math-linear-function"
    ]);
  });

  it("falls back to the most relevant recommendation when nothing is selected", () => {
    expect(resolveSelectedCurriculumRecommendations(recommendations, []).map((item) => item.chunkId)).toEqual(["korean-grammar"]);
  });

  it("toggles a curriculum recommendation in and out of the selected list", () => {
    expect(toggleCurriculumSelection(["korean-grammar"], "korean-writing")).toEqual(["korean-grammar", "korean-writing"]);
    expect(toggleCurriculumSelection(["korean-grammar", "korean-writing"], "korean-grammar")).toEqual(["korean-writing"]);
  });

  it("shows the first three recommendations before expansion and all recommendations after expansion", () => {
    expect(getVisibleCurriculumRecommendations(recommendations, false).map((item) => item.chunkId)).toEqual([
      "korean-grammar",
      "korean-writing",
      "korean-literature"
    ]);
    expect(getVisibleCurriculumRecommendations(recommendations, true)).toHaveLength(4);
  });

  it("converts the selected recommendation into a saved curriculum link", () => {
    expect(toCurriculumLink(recommendations[0])).toEqual({
      chunkId: "korean-grammar",
      sourceTitle: "국어",
      subject: "국어",
      area: "문법",
      achievement: "[9국04-03] 품사의 종류와 특성을 이해한다."
    });
  });

  it("formats the visible card selection state", () => {
    expect(formatCurriculumSelectionStatus(true)).toBe("선택됨");
    expect(formatCurriculumSelectionStatus(false)).toBe("선택");
  });
});

function recommendation(chunkId: string, achievement: string): CurriculumRecommendationView {
  return {
    chunkId,
    label: "추천",
    reason: "문법 영역에서 수업 주제와 연결되는 성취기준입니다.",
    score: 10,
    chunk: {
      id: chunkId,
      sourceTitle: "국어",
      schoolLevel: "middle",
      gradeBand: "1-3",
      subject: "국어",
      area: "문법",
      achievement,
      excerpt: achievement
    }
  };
}
