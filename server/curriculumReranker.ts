import ky from "ky";
import { z } from "zod";
import type { CurriculumRecommendationCandidate } from "./curriculumIndex.js";

const DEFAULT_UPSTAGE_API_URL = "https://api.upstage.ai/v1";
const DEFAULT_UPSTAGE_MODEL = "solar-pro2";
const DEFAULT_UPSTAGE_TIMEOUT_MS = 3_000;

const upstageResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
      }),
    )
    .min(1),
});

const rankedIdsSchema = z.object({
  rankedChunkIds: z.array(z.string()),
});

export type CurriculumRerankContext = {
  readonly query: string;
  readonly schoolLevel: string;
  readonly gradeBand: string;
  readonly subject: string;
};

type CurriculumRerankInput = {
  readonly candidates: readonly CurriculumRecommendationCandidate[];
  readonly context: CurriculumRerankContext;
  readonly env: Readonly<Record<string, string | undefined>>;
};

export async function rerankCurriculumCandidates(
  input: CurriculumRerankInput,
): Promise<readonly CurriculumRecommendationCandidate[]> {
  if (input.candidates.length <= 1) return input.candidates;

  const apiKey = input.env.UPSTAGE_API_KEY?.trim();
  if (!apiKey) return input.candidates;

  const baseUrl = stripTrailingSlash(
    input.env.UPSTAGE_API_URL?.trim() || DEFAULT_UPSTAGE_API_URL,
  );
  const model = input.env.UPSTAGE_MODEL?.trim() || DEFAULT_UPSTAGE_MODEL;
  const timeout = resolveTimeout(input.env.UPSTAGE_TIMEOUT_MS);

  try {
    const response = await ky.post(`${baseUrl}/chat/completions`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      json: {
        model,
        messages: [
          {
            role: "system",
            content:
              "당신은 2022 개정 교육과정 성취기준 재랭커다. 제공된 후보만 수업과 관련성 높은 순서로 정렬한다. 학교급, 학년, 과목, 학습 행동의 일치를 우선한다. 후보 밖 ID를 만들지 말고 JSON 객체 하나만 출력한다.",
          },
          {
            role: "user",
            content: JSON.stringify({
              lesson: input.context,
              candidates: input.candidates.map((candidate) => ({
                chunkId: candidate.chunkId,
                schoolLevel: candidate.schoolLevel,
                gradeBand: candidate.gradeBand,
                subject: candidate.subject,
                area: candidate.area,
                achievement: candidate.achievement.slice(0, 800),
              })),
              outputSchema: {
                rankedChunkIds: ["candidate chunkId"],
              },
            }),
          },
        ],
        temperature: 0,
        max_tokens: 500,
        response_format: {
          type: "json_object",
        },
      },
      retry: 0,
      timeout,
      throwHttpErrors: false,
    });

    if (!response.ok) return input.candidates;

    const responsePayload: unknown = await response.json();
    const parsedResponse = upstageResponseSchema.safeParse(responsePayload);
    if (!parsedResponse.success) return input.candidates;

    const rankedIds = parseRankedIds(
      parsedResponse.data.choices[0].message.content,
    );
    return mergeRankedCandidates(input.candidates, rankedIds);
  } catch (error) {
    if (error instanceof Error) return input.candidates;
    throw error;
  }
}

function parseRankedIds(content: string): readonly string[] {
  try {
    const parsedContent: unknown = JSON.parse(
      content.replace(/^```json\s*|```$/g, "").trim(),
    );
    const result = rankedIdsSchema.safeParse(parsedContent);
    return result.success ? result.data.rankedChunkIds : [];
  } catch (error) {
    if (error instanceof SyntaxError) return [];
    throw error;
  }
}

function mergeRankedCandidates(
  candidates: readonly CurriculumRecommendationCandidate[],
  rankedIds: readonly string[],
): readonly CurriculumRecommendationCandidate[] {
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.chunkId, candidate]),
  );
  const selectedIds = new Set<string>();
  const rankedCandidates: CurriculumRecommendationCandidate[] = [];

  for (const chunkId of rankedIds) {
    const candidate = candidateById.get(chunkId);
    if (!candidate || selectedIds.has(chunkId)) continue;
    selectedIds.add(chunkId);
    rankedCandidates.push(candidate);
  }

  if (rankedCandidates.length === 0) return candidates;

  return [
    ...rankedCandidates,
    ...candidates.filter((candidate) => !selectedIds.has(candidate.chunkId)),
  ];
}

function resolveTimeout(value: string | undefined): number {
  const timeout = Number(value);
  return Number.isFinite(timeout) && timeout > 0
    ? timeout
    : DEFAULT_UPSTAGE_TIMEOUT_MS;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
