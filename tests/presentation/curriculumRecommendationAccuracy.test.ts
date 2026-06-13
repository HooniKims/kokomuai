import { describe, expect, it } from "vitest";
import { formatRecommendationRelevance } from "../../src/presentation/curriculumRecommendationAccuracy";

describe("formatRecommendationRelevance", () => {
  it("formats the recommendation score as a relevance level", () => {
    expect(formatRecommendationRelevance(13)).toBe("관련성 상");
    expect(formatRecommendationRelevance(5)).toBe("관련성 중");
    expect(formatRecommendationRelevance(1)).toBe("관련성 하");
  });

  it("hides the label when score is missing", () => {
    expect(formatRecommendationRelevance(undefined)).toBeNull();
  });
});
