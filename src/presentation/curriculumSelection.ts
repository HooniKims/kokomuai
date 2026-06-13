import type { CurriculumLink } from "../domain/chatbot/chatbotManagement";
import type { CurriculumRecommendationView } from "./apiClient";

const DEFAULT_VISIBLE_RECOMMENDATION_COUNT = 3;

export function resolveSelectedCurriculumRecommendations(
  recommendations: CurriculumRecommendationView[],
  selectedChunkIds: string[]
): CurriculumRecommendationView[] {
  const selectedIdSet = new Set(selectedChunkIds);
  const selected = recommendations.filter((item) => selectedIdSet.has(item.chunkId));
  return selected.length > 0 ? selected : recommendations.slice(0, 1);
}

export function toggleCurriculumSelection(selectedChunkIds: string[], chunkId: string): string[] {
  return selectedChunkIds.includes(chunkId) ? selectedChunkIds.filter((id) => id !== chunkId) : [...selectedChunkIds, chunkId];
}

export function getVisibleCurriculumRecommendations(
  recommendations: CurriculumRecommendationView[],
  expanded: boolean
): CurriculumRecommendationView[] {
  return expanded ? recommendations : recommendations.slice(0, DEFAULT_VISIBLE_RECOMMENDATION_COUNT);
}

export function toCurriculumLink(recommendation: CurriculumRecommendationView): CurriculumLink {
  return {
    chunkId: recommendation.chunk.id,
    sourceTitle: recommendation.chunk.sourceTitle,
    subject: recommendation.chunk.subject,
    area: recommendation.chunk.area,
    achievement: recommendation.chunk.achievement
  };
}

export function formatCurriculumSelectionStatus(selected: boolean): string {
  return selected ? "선택됨" : "선택";
}
