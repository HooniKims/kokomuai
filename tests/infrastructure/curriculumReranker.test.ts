import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  rerankCurriculumCandidates,
  type CurriculumRerankContext,
} from "../../server/curriculumReranker";
import type { CurriculumRecommendationCandidate } from "../../server/curriculumIndex";

const openServers: http.Server[] = [];
const leaveResponsePending: http.RequestListener = () => undefined;

const context: CurriculumRerankContext = {
  query: "초등 과학 전구가 켜지는 조건",
  schoolLevel: "elementary",
  gradeBand: "5-6",
  subject: "과학",
};

const candidates: readonly CurriculumRecommendationCandidate[] = [
  {
    id: "internal-first",
    chunkId: "internal-first",
    sourceTitle: "과학과 교육과정",
    schoolLevel: "elementary",
    gradeBand: "5-6",
    subject: "과학",
    area: "식물의 한살이",
    achievement: "식물이 자라는 조건을 실험한다.",
    excerpt: "식물 생장 조건",
    sectionPath: "과학 > 식물의 한살이",
    matchedTerms: ["조건"],
    score: 6,
  },
  {
    id: "correct-circuit",
    chunkId: "correct-circuit",
    sourceTitle: "과학과 교육과정",
    schoolLevel: "elementary",
    gradeBand: "5-6",
    subject: "과학",
    area: "전기의 이용",
    achievement: "전지와 전구를 연결하여 불이 켜지는 회로의 특징을 말한다.",
    excerpt: "전기 회로",
    sectionPath: "과학 > 전기의 이용",
    matchedTerms: ["전구", "조건"],
    score: 6,
  },
  {
    id: "internal-third",
    chunkId: "internal-third",
    sourceTitle: "과학과 교육과정",
    schoolLevel: "elementary",
    gradeBand: "5-6",
    subject: "과학",
    area: "빛",
    achievement: "빛의 진행을 관찰한다.",
    excerpt: "빛의 진행",
    sectionPath: "과학 > 빛",
    matchedTerms: ["전구"],
    score: 3,
  },
];

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe("curriculumReranker", () => {
  it("orders only supplied candidates and appends omitted candidates in internal order", async () => {
    let requestBody = "";
    const baseUrl = await startUpstageServer(async (request, response) => {
      requestBody = await readRequestBody(request);
      sendJson(response, 200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                rankedChunkIds: [
                  "correct-circuit",
                  "invented-standard",
                  "internal-first",
                ],
              }),
            },
          },
        ],
      });
    });

    const result = await rerankCurriculumCandidates({
      candidates,
      context,
      env: upstageEnv(baseUrl),
    });

    expect(result.map((candidate) => candidate.chunkId)).toEqual([
      "correct-circuit",
      "internal-first",
      "internal-third",
    ]);
    expect(requestBody).toContain('"model":"solar-pro2"');
    expect(requestBody).toContain('\\"subject\\":\\"과학\\"');
    expect(requestBody).not.toContain("invented-standard");
  });

  it("returns the internal order when Upstage responds with an error", async () => {
    const baseUrl = await startUpstageServer((_request, response) => {
      sendJson(response, 503, { error: "unavailable" });
    });

    const result = await rerankCurriculumCandidates({
      candidates,
      context,
      env: upstageEnv(baseUrl),
    });

    expect(result).toEqual(candidates);
  });

  it("returns the internal order when Upstage returns an invalid payload", async () => {
    const baseUrl = await startUpstageServer((_request, response) => {
      sendJson(response, 200, { choices: [] });
    });

    const result = await rerankCurriculumCandidates({
      candidates,
      context,
      env: upstageEnv(baseUrl),
    });

    expect(result).toEqual(candidates);
  });

  it("returns the internal order when Upstage exceeds the timeout", async () => {
    const baseUrl = await startUpstageServer(leaveResponsePending);

    const result = await rerankCurriculumCandidates({
      candidates,
      context,
      env: {
        ...upstageEnv(baseUrl),
        UPSTAGE_TIMEOUT_MS: "20",
      },
    });

    expect(result).toEqual(candidates);
  });

  it("returns the internal order without a request when the API key is missing", async () => {
    const result = await rerankCurriculumCandidates({
      candidates,
      context,
      env: {
        UPSTAGE_API_URL: "http://127.0.0.1:1",
        UPSTAGE_MODEL: "solar-pro2",
      },
    });

    expect(result).toEqual(candidates);
  });
});

async function startUpstageServer(
  listener: http.RequestListener,
): Promise<string> {
  const server = http.createServer(listener);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  openServers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new TypeError("Expected a TCP test server address");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function readRequestBody(request: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(
  response: http.ServerResponse,
  status: number,
  payload: object,
): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function upstageEnv(baseUrl: string): Record<string, string> {
  return {
    UPSTAGE_API_KEY: "test-upstage-key",
    UPSTAGE_API_URL: baseUrl,
    UPSTAGE_MODEL: "solar-pro2",
    UPSTAGE_TIMEOUT_MS: "500",
  };
}
