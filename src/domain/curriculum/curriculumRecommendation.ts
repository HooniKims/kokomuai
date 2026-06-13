import type { SchoolLevel } from "../chatbot/types";

export interface CurriculumChunk {
  id: string;
  sourceTitle: string;
  schoolLevel: SchoolLevel | "all";
  gradeBand: string;
  subject: string;
  area: string;
  achievement: string;
  excerpt: string;
}

export interface CurriculumRecommendation {
  chunkId: string;
  label: "추천" | "관련 있음" | "검토 필요";
  reason: string;
  chunk: CurriculumChunk;
}

interface RecommendInput {
  topic: string;
  schoolLevel?: SchoolLevel;
  gradeBand?: string;
  chunks: CurriculumChunk[];
}

export function recommendCurriculum(input: RecommendInput): CurriculumRecommendation[] {
  const topicTerms = tokenize(input.topic);

  return input.chunks
    .filter((chunk) => matchesRecommendationScope(chunk, input))
    .map((chunk) => {
      const text = `${chunk.subject} ${chunk.area} ${chunk.achievement} ${chunk.excerpt}`;
      const score = scoreChunk(topicTerms, tokenize(text), chunk, input);

      return {
        score,
        chunk
      };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ score, chunk }) => ({
      chunkId: chunk.id,
      label: labelForScore(score),
      reason: buildReason(input.topic, chunk, score),
      chunk
    }));
}

function matchesRecommendationScope(chunk: CurriculumChunk, input: RecommendInput): boolean {
  if (input.schoolLevel && chunk.schoolLevel !== input.schoolLevel && chunk.schoolLevel !== "all") {
    return false;
  }

  if (input.gradeBand && !matchesGradeBand(chunk.gradeBand, input.gradeBand)) {
    return false;
  }

  return true;
}

function matchesGradeBand(chunkGradeBand: string, inputGradeBand: string): boolean {
  if (chunkGradeBand === "all") return true;
  if (chunkGradeBand === inputGradeBand) return true;

  const range = /^(\d+)-(\d+)$/.exec(chunkGradeBand);
  const requested = Number(inputGradeBand);
  if (!range || Number.isNaN(requested)) return false;

  const start = Number(range[1]);
  const end = Number(range[2]);
  return requested >= start && requested <= end;
}

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^0-9a-z가-힣]+/i)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2)
    )
  );
}

function scoreChunk(
  topicTerms: string[],
  chunkTerms: string[],
  chunk: CurriculumChunk,
  input: RecommendInput
): number {
  const chunkTermSet = new Set(chunkTerms);
  let score = topicTerms.filter((term) => chunkTermSet.has(term)).length * 3;

  if (input.schoolLevel && chunk.schoolLevel === input.schoolLevel) {
    score += 2;
  }

  if (input.gradeBand && chunk.gradeBand === input.gradeBand) {
    score += 1;
  }

  return score;
}

function labelForScore(score: number): CurriculumRecommendation["label"] {
  if (score >= 6) return "추천";
  if (score >= 2) return "관련 있음";
  return "검토 필요";
}

function buildReason(topic: string, chunk: CurriculumChunk, score: number): string {
  if (score >= 6) {
    const term = tokenize(topic).find((item) => `${chunk.achievement} ${chunk.excerpt}`.includes(item));
    return `${term ?? chunk.area} 내용이 수업 주제와 직접 이어집니다.`;
  }

  if (score >= 2) {
    return `${chunk.area} 영역에서 함께 검토할 만한 관련 내용입니다.`;
  }

  return "주제와 직접 연결되는지 교사가 한 번 더 확인하면 좋습니다.";
}
