export function formatRecommendationRelevance(score: number | undefined): string | null {
  if (typeof score !== "number") return null;
  if (score >= 8) return "관련성 상";
  if (score >= 5) return "관련성 중";
  return "관련성 하";
}
