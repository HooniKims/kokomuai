import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createApiHandler } from "../../server/apiHandler";
import { createLocalStore } from "../../server/localStore";
import { createChatbot, enableShareLink } from "../../src/domain/chatbot/chatbotManagement";
import { approveTeacher, registerLocalTeacher } from "../../src/domain/identity/identityAccess";

const tempRoots: string[] = [];
const openServers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map(closeServer));
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("apiHandler", () => {
  it("serves health and local API routes through one shared handler", async () => {
    const { baseUrl } = await createServer();

    const health = await fetch(`${baseUrl}/api/health`);
    expect(health.headers.get("Cache-Control")).toBe("no-store");
    await expect(health.json()).resolves.toMatchObject({
      ok: true,
      provider: "lmstudio",
      model: "gemma-4-12b-it"
    });

    const schools = await fetch(`${baseUrl}/api/schools/search?q=${encodeURIComponent("새빛중")}`);
    await expect(schools.json()).resolves.toEqual({
      schools: [
        {
          schoolName: "새빛중학교",
          schoolKind: "중학교",
          officeCode: "B10",
          standardSchoolCode: "1234567",
          region: "서울특별시",
          address: "서울특별시 중구 예시로 1"
        }
      ]
    });
  });

  it("handles chat guardrails without calling the upstream provider", async () => {
    const { baseUrl } = await createServer({
      fetchImpl: async () => {
        throw new Error("provider should not be called");
      }
    });

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "010-1234-5678로 연락해줘",
        history: [],
        chatbot: {
          name: "중학교 국어 품사",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "국어",
          topic: "품사의 종류와 특성",
          learningGoal: "품사의 역할을 문장 속에서 구분한다.",
          hintStrength: "medium",
          persona: "답을 바로 주지 않고 질문으로 돕는 국어 선생님"
        }
      })
    });

    expect(response.status).toBe(422);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: "privacy_risk"
    });
  });

  it("echoes the allowed local app origin for chat responses", async () => {
    const { baseUrl } = await createServer({
      fetchImpl: async () => {
        throw new Error("provider should not be called");
      }
    });

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:5173"
      },
      body: JSON.stringify({
        message: "010-1234-5678로 연락해줘",
        history: [],
        chatbot: {
          name: "중학교 국어 품사",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "국어",
          topic: "품사의 종류와 특성",
          learningGoal: "품사의 역할을 문장 속에서 구분한다.",
          hintStrength: "medium",
          persona: "답을 바로 주지 않고 질문으로 돕는 국어 선생님"
        }
      })
    });

    expect(response.status).toBe(422);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:5173");
  });

  it("rejects chat preflight requests from untrusted browser origins", async () => {
    const { baseUrl } = await createServer();

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Authorization"
      }
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("rejects oversized chat payloads before provider calls", async () => {
    const { baseUrl } = await createServer({
      fetchImpl: async () => {
        throw new Error("provider should not be called");
      }
    });

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "가".repeat(140 * 1024),
        history: [],
        chatbot: {
          name: "중학교 국어 품사",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "국어",
          topic: "품사의 종류와 특성",
          learningGoal: "품사의 역할을 문장 속에서 구분한다.",
          hintStrength: "medium",
          persona: "답을 바로 주지 않고 질문으로 돕는 국어 선생님"
        }
      })
    });

    expect(response.status).toBe(413);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: "payload_too_large"
    });
  });

  it("rejects long student messages below the JSON body limit before provider calls", async () => {
    const { baseUrl } = await createServer({
      fetchImpl: async () => {
        throw new Error("provider should not be called");
      }
    });

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "가".repeat(2401),
        history: [],
        chatbot: {
          name: "중학교 국어 품사",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "국어",
          topic: "품사의 종류와 특성",
          learningGoal: "품사의 역할을 문장 속에서 구분한다.",
          hintStrength: "medium",
          persona: "답을 바로 주지 않고 질문으로 돕는 국어 선생님"
        }
      })
    });

    expect(response.status).toBe(413);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "message_too_long",
      message: "질문이 너무 깁니다. 핵심 질문만 짧게 정리해 다시 보내 주세요."
    });
  });

  it("marks local guardrail SSE responses as non-cacheable", async () => {
    const { baseUrl } = await createServer({
      fetchImpl: async () => {
        throw new Error("provider should not be called");
      }
    });

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "세종대왕의 업적을 알려줘.",
        history: [],
        chatbot: {
          name: "초등 과학 물의 상태 변화",
          schoolLevel: "elementary",
          gradeBand: "5-6",
          subject: "과학",
          topic: "물의 상태 변화",
          learningGoal: "학생이 물의 상태 변화를 관찰 근거로 설명하도록 돕는다.",
          hintStrength: "medium",
          persona: "답을 바로 주지 않고 질문으로 돕는 과학 선생님"
        }
      })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    await expect(response.text()).resolves.toContain("범위 안에서만");
  });

  it("rejects student provider calls that spoof chatbot ownership without a valid share token", async () => {
    const { baseUrl } = await createServer({
      fetchImpl: async () => {
        throw new Error("provider should not be called");
      }
    });

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "관형사와 부사의 차이가 궁금해",
        history: [],
        chatbot: {
          id: "chatbot-1",
          ownerTeacherId: "spoofed-teacher",
          name: "중학교 국어 품사",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "국어",
          topic: "품사의 종류와 특성",
          learningGoal: "품사의 역할을 문장 속에서 구분한다.",
          hintStrength: "medium",
          persona: "답을 바로 주지 않고 질문으로 돕는 국어 선생님"
        }
      })
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: "share_token_required"
    });
  });

  it("records provider failures for admin review and monthly error summaries without raw student text", async () => {
    const { baseUrl, store } = await createServer({
      env: {
        LMSTUDIO_API_KEY: "test-lmstudio-key"
      },
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { message: "upstream failed with OPENAI_API_KEY=secret-value" } }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
    });
    const teacher = approveTeacher(createTeacher("teacher-1", "teacher@example.com"), {
      adminId: "local-admin",
      now: "2026-06-13T06:10:00.000Z",
      logId: "admin-log-1"
    }).teacher;
    await store.saveTeacher(teacher);
    const shared = enableShareLink(
      createChatbot(
        {
          ownerTeacherId: teacher.id,
          name: "중학교 국어 품사",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "국어",
          topic: "품사의 종류와 특성",
          learningGoal: "품사의 역할을 문장 속에서 구분한다.",
          hintStrength: "medium",
          persona: "답을 바로 주지 않고 질문으로 돕는 국어 선생님"
        },
        { id: "chatbot-1", now: "2026-06-13T06:11:00.000Z" }
      ),
      {
        actorTeacherId: teacher.id,
        token: "public-token-123456"
      }
    );
    await store.saveChatbot(shared);

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "학생 질문 원문: 관형사와 부사의 차이가 궁금해",
        history: [],
        chatbot: { id: "chatbot-1" },
        shareToken: "public-token-123456",
        conversationId: "conversation-1"
      })
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: "provider_error",
      message: "응답을 불러오지 못했어요. 잠시 후 다시 시도하거나 선생님께 알려 주세요."
    });
    await expect(store.listProviderErrorLogs()).resolves.toEqual([
      expect.objectContaining({
        provider: "lmstudio",
        status: 503,
        teacherId: "teacher-1",
        chatbotId: "chatbot-1",
        surface: "student_share"
      })
    ]);
    const serializedLogs = JSON.stringify(await store.listProviderErrorLogs());
    expect(serializedLogs).not.toContain("학생 질문 원문");
    expect(serializedLogs).not.toContain("OPENAI_API_KEY");
    expect(serializedLogs).not.toContain("secret-value");

    await expect(store.listUsageSummariesByTeacher("teacher-1")).resolves.toEqual([
      expect.objectContaining({
        teacherId: "teacher-1",
        chatbotId: "chatbot-1",
        conversationCount: 1,
        aiCallCount: 0,
        errorCount: 1
      })
    ]);
    expect(JSON.stringify(await store.listUsageEvents())).not.toContain("학생 질문 원문");
  });

  it("falls back to the default 12B model when the selected E2B provider call fails", async () => {
    const requestedModels: string[] = [];
    const { baseUrl, store } = await createServer({
      env: {
        LMSTUDIO_API_KEY: "test-lmstudio-key"
      },
      fetchImpl: async (_url, init) => {
        const request = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
        requestedModels.push(request.model ?? "");
        if (request.model === "google/gemma-4-e2b") {
          return new Response(JSON.stringify({ error: { message: "model not loaded" } }), {
            status: 502,
            headers: { "Content-Type": "application/json" }
          });
        }

        return new Response(
          'data: {"choices":[{"delta":{"content":"도와줄게요."}}]}\n\ndata: [DONE]\n\n',
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" }
          }
        );
      }
    });
    await store.saveAiSettings({
      activeModelId: "gemma4:e2b",
      updatedAt: "2026-06-14T10:20:00.000Z",
      updatedBy: "admin-1"
    });

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "일차방정식이 뭐야?",
        history: [],
        chatbot: {
          name: "수학 챗봇",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "수학",
          topic: "일차방정식",
          learningGoal: "일차방정식을 이해한다.",
          hintStrength: "medium",
          persona: "질문으로 돕는 수학 선생님"
        }
      })
    });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("도와줄게요.");
    expect(requestedModels).toEqual(["google/gemma-4-e2b", "gemma-4-12b-it"]);
  });

  it("falls back to OpenAI when local LM Studio models are unavailable from production", async () => {
    const requestedModels: string[] = [];
    const { baseUrl, store } = await createServer({
      env: {
        LMSTUDIO_API_KEY: "test-lmstudio-key",
        OPENAI_API_KEY: "test-openai-key"
      },
      fetchImpl: async (_url, init) => {
        const request = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
        requestedModels.push(request.model ?? "");
        if (request.model?.includes("gemma")) {
          return new Response(JSON.stringify({ error: { message: "local model unavailable" } }), {
            status: 502,
            headers: { "Content-Type": "application/json" }
          });
        }

        return new Response(
          'data: {"choices":[{"delta":{"content":"OpenAI fallback answer."}}]}\n\ndata: [DONE]\n\n',
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" }
          }
        );
      }
    });
    await store.saveAiSettings({
      activeModelId: "gemma4:e2b",
      updatedAt: "2026-06-14T10:20:00.000Z",
      updatedBy: "admin-1"
    });

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "일차방정식이 뭐야?",
        history: [],
        chatbot: {
          name: "수학 챗봇",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "수학",
          topic: "일차방정식",
          learningGoal: "일차방정식을 이해한다.",
          hintStrength: "medium",
          persona: "질문으로 돕는 수학 선생님"
        }
      })
    });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("OpenAI fallback answer.");
    expect(requestedModels).toEqual(["google/gemma-4-e2b", "gemma-4-12b-it", "gpt-5.4-nano"]);
  });

  it("records OpenAI GPT-5.4 nano streaming usage tokens for billing", async () => {
    const { baseUrl, store } = await createServer({
      env: {
        OPENAI_API_KEY: "test-openai-key"
      },
      fetchImpl: async () =>
        new Response(
          [
            'data: {"choices":[{"delta":{"content":"좋아요."}}]}\n\n',
            'data: {"choices":[],"usage":{"prompt_tokens":1200,"completion_tokens":340,"prompt_tokens_details":{"cached_tokens":200}}}\n\n',
            "data: [DONE]\n\n"
          ].join(""),
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" }
          }
        )
    });
    await store.saveAiSettings({
      activeModelId: "openai:gpt-5.4-nano",
      updatedAt: "2026-06-14T10:20:00.000Z",
      updatedBy: "admin-1"
    });
    const teacher = approveTeacher(createTeacher("teacher-usage", "usage@example.com"), {
      adminId: "local-admin",
      now: "2026-06-13T06:10:00.000Z",
      logId: "admin-log-usage"
    }).teacher;
    await store.saveTeacher(teacher);
    const shared = enableShareLink(
      createChatbot(
        {
          ownerTeacherId: teacher.id,
          name: "과학 챗봇",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "과학",
          topic: "빛의 굴절",
          learningGoal: "빛의 굴절을 이해한다.",
          hintStrength: "medium",
          persona: "질문으로 돕는 과학 선생님"
        },
        { id: "chatbot-usage", now: "2026-06-13T06:11:00.000Z" }
      ),
      {
        actorTeacherId: teacher.id,
        token: "public-token-usage"
      }
    );
    await store.saveChatbot(shared);

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "빛의 굴절이 뭐야?",
        history: [],
        chatbot: { id: "chatbot-usage" },
        shareToken: "public-token-usage",
        conversationId: "conversation-usage"
      })
    });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("좋아요.");
    await expect(store.listUsageEvents()).resolves.toEqual([
      expect.objectContaining({
        provider: "openai",
        modelId: "openai:gpt-5.4-nano",
        inputTokenEstimate: 1200,
        outputTokenEstimate: 340,
        estimatedCostUsd: 0.000629
      })
    ]);
  });

  it("removes streamed thinking traces before sending provider tokens to students", async () => {
    const { baseUrl, store } = await createServer({
      env: {
        LMSTUDIO_API_KEY: "test-lmstudio-key"
      },
      fetchImpl: async () =>
        new Response(
          [
            'data: {"choices":[{"delta":{"content":"<thi"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"nk>private chain"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":" of thought</think>학생에게는 "}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"질문만 보여요."}}]}\n\n',
            "data: [DONE]\n\n"
          ].join(""),
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" }
          }
        )
    });
    await store.saveAiSettings({
      activeModelId: "gemma4:e2b",
      updatedAt: "2026-06-14T10:20:00.000Z",
      updatedBy: "admin-1"
    });

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "일차방정식이 뭐야?",
        history: [],
        chatbot: {
          name: "수학 챗봇",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "수학",
          topic: "일차방정식",
          learningGoal: "일차방정식을 이해한다.",
          hintStrength: "medium",
          persona: "질문으로 돕는 수학 선생님"
        }
      })
    });

    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("학생에게는");
    expect(body).toContain("질문만 보여요.");
    expect(body).not.toContain("<think>");
    expect(body).not.toContain("private chain");
    expect(JSON.stringify(await store.listUsageEvents())).not.toContain("private chain");
  });

  it("removes E2B channel preambles before sending the final answer to students", async () => {
    const { baseUrl, store } = await createServer({
      env: {
        LMSTUDIO_API_KEY: "test-lmstudio-key"
      },
      fetchImpl: async () =>
        new Response(
          [
            'data: {"choices":[{"delta":{"content":"학생은 이전 답변에 대해 그래라고 짧게 대답했다.\\n\\n"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"현재 상황: 1차 함수 정의를 제시했다.\\n"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"다음 사고 단계: 식으로 연결한다.\\n"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"질문 방향: 일차식으로 연결하자.<channel|>"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"네, 그럼 1차 함수 식을 살펴볼까요?"}}]}\n\n',
            "data: [DONE]\n\n"
          ].join(""),
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" }
          }
        )
    });
    await store.saveAiSettings({
      activeModelId: "gemma4:e2b",
      updatedAt: "2026-06-14T10:20:00.000Z",
      updatedBy: "admin-1"
    });

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "그래",
        history: [{ role: "assistant", content: "1차 함수의 뜻을 알아볼까요?" }],
        chatbot: {
          name: "수학 챗봇",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "수학",
          topic: "1차 함수",
          learningGoal: "1차 함수의 뜻과 식을 이해한다.",
          hintStrength: "medium",
          persona: "질문으로 돕는 수학 선생님"
        }
      })
    });

    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("네, 그럼 1차 함수 식을 살펴볼까요?");
    expect(body).not.toContain("학생은 이전 답변");
    expect(body).not.toContain("현재 상황");
    expect(body).not.toContain("다음 사고 단계");
    expect(body).not.toContain("질문 방향");
    expect(body).not.toContain("<channel|>");
    expect(JSON.stringify(await store.listUsageEvents())).not.toContain("현재 상황");
  });

  it("sends a safe fallback question when the model only streams hidden reasoning", async () => {
    const { baseUrl, store } = await createServer({
      env: {
        LMSTUDIO_API_KEY: "test-lmstudio-key"
      },
      fetchImpl: async () =>
        new Response(
          [
            'data: {"choices":[{"delta":{"content":"학생은 이전 답변에 대해 그래라고 짧게 대답했다.\\n"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"현재 상황: 다음 단계로 넘어가야 한다.\\n"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"질문 방향: 식으로 연결하자."}}]}\n\n',
            "data: [DONE]\n\n"
          ].join(""),
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" }
          }
        )
    });
    await store.saveAiSettings({
      activeModelId: "gemma4:e2b",
      updatedAt: "2026-06-14T10:20:00.000Z",
      updatedBy: "admin-1"
    });

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "그래",
        history: [{ role: "assistant", content: "1차 함수의 뜻을 알아볼까요?" }],
        chatbot: {
          name: "수학 챗봇",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "수학",
          topic: "1차 함수",
          learningGoal: "1차 함수의 뜻과 식을 이해한다.",
          hintStrength: "medium",
          persona: "질문으로 돕는 수학 선생님"
        }
      })
    });

    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("1차 함수");
    expect(body).toContain("어떤 점이 궁금한가요");
    expect(body).not.toContain("현재 상황");
    expect(body).not.toContain("질문 방향");
  });

  it("removes planning-style Korean reasoning even without a channel marker", async () => {
    const { baseUrl, store } = await createServer({
      env: {
        LMSTUDIO_API_KEY: "test-lmstudio-key"
      },
      fetchImpl: async () =>
        new Response(
          [
            'data: {"choices":[{"delta":{"content":"학생이 그래라고만 대답했다. 수업 목표는 1차 함수의 뜻과 식을 이해하는 것이다.\\n\\n"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"**계획:**\\n1. 학생 반응을 격려한다.\\n2. 1차 함수가 무엇인지 묻는다."}}]}\n\n',
            "data: [DONE]\n\n"
          ].join(""),
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" }
          }
        )
    });
    await store.saveAiSettings({
      activeModelId: "gemma4:e2b",
      updatedAt: "2026-06-14T10:20:00.000Z",
      updatedBy: "admin-1"
    });

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "그래",
        history: [{ role: "assistant", content: "1차 함수의 뜻을 알아볼까요?" }],
        chatbot: {
          name: "수학 챗봇",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "수학",
          topic: "1차 함수",
          learningGoal: "1차 함수의 뜻과 식을 이해한다.",
          hintStrength: "medium",
          persona: "질문으로 돕는 수학 선생님"
        }
      })
    });

    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("1차 함수");
    expect(body).toContain("어떤 점이 궁금한가요");
    expect(body).not.toContain("수업 목표");
    expect(body).not.toContain("**계획:**");
    expect(body).not.toContain("학생 반응");
  });

  it("removes goal and action-plan reasoning before the student-facing answer", async () => {
    const { baseUrl, store } = await createServer({
      env: {
        LMSTUDIO_API_KEY: "test-lmstudio-key"
      },
      fetchImpl: async () =>
        new Response(
          [
            'data: {"choices":[{"delta":{"content":"학생은 독립변수와 종속변수 같은 새로운 용어를 어렵다고 느꼈습니다.\\n\\n"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"현재 목표: 학생이 기본 용어를 명확히 이해하도록 돕는다.\\n"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"다음 행동 계획:\\n1. x와 y의 관계를 쉬운 비유로 설명한다.\\n"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"힌트 강도: 낮음. 쉬운 비유 사용."}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"아이고, 제가 조금 어려운 말을 썼네요. 다시 쉽게 볼까요?"}}]}\n\n',
            "data: [DONE]\n\n"
          ].join(""),
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" }
          }
        )
    });
    await store.saveAiSettings({
      activeModelId: "gemma4:e2b",
      updatedAt: "2026-06-14T10:20:00.000Z",
      updatedBy: "admin-1"
    });

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "어려워요",
        history: [{ role: "assistant", content: "독립변수와 종속변수를 알아볼까요?" }],
        chatbot: {
          name: "수학 챗봇",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "수학",
          topic: "1차 함수",
          learningGoal: "1차 함수의 뜻과 식을 이해한다.",
          hintStrength: "low",
          persona: "질문으로 돕는 수학 선생님"
        }
      })
    });

    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("어려운 말을");
    expect(body).not.toContain("현재 목표");
    expect(body).not.toContain("다음 행동 계획");
    expect(body).not.toContain("힌트 강도");
    expect(body).not.toContain("어렵다고 느꼈습니다");
  });

  it("does not wait for a long initial buffer before streaming normal answers", async () => {
    const { baseUrl, store } = await createServer({
      env: {
        LMSTUDIO_API_KEY: "test-lmstudio-key"
      },
      fetchImpl: async () =>
        new Response(
          [
            'data: {"choices":[{"delta":{"content":"네, 그럼 바로 시작해요. "}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"먼저 x를 넣는 숫자로 볼게요. "}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"y는 따라 나오는 값이에요."}}]}\n\n',
            "data: [DONE]\n\n"
          ].join(""),
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" }
          }
        )
    });
    await store.saveAiSettings({
      activeModelId: "gemma4:e2b",
      updatedAt: "2026-06-14T10:20:00.000Z",
      updatedBy: "admin-1"
    });

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "그래",
        history: [],
        chatbot: {
          name: "수학 챗봇",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "수학",
          topic: "1차 함수",
          learningGoal: "1차 함수의 뜻과 식을 이해한다.",
          hintStrength: "medium",
          persona: "질문으로 돕는 수학 선생님"
        }
      })
    });

    const body = await response.text();
    const contentEventCount = body.match(/"content"/g)?.length ?? 0;

    expect(response.status).toBe(200);
    expect(contentEventCount).toBeGreaterThanOrEqual(2);
  });

  it("removes bullet-style student reaction planning before the final answer", async () => {
    const { baseUrl, store } = await createServer({
      env: {
        LMSTUDIO_API_KEY: "test-lmstudio-key"
      },
      fetchImpl: async () =>
        new Response(
          [
            'data: {"choices":[{"delta":{"content":"* 학생 반응: \\"5\\"\\n* 현재 상태: 학생은 x=2를 대입했다.\\n"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"* 목표: 함수 개념을 확립한다.\\n* 다음 단계: 규칙으로 정리한다.\\n\\n"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"계획:\\n1. 학생의 정답을 칭찬한다.\\n질문 생성: (칭찬 후 정리)"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"와! 맞아요. 5가 나오네요! 정말 잘하셨어요."}}]}\n\n',
            "data: [DONE]\n\n"
          ].join(""),
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" }
          }
        )
    });
    await store.saveAiSettings({
      activeModelId: "gemma4:e2b",
      updatedAt: "2026-06-14T10:20:00.000Z",
      updatedBy: "admin-1"
    });

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "5",
        history: [{ role: "assistant", content: "x에 2를 넣으면 y는 얼마일까요?" }],
        chatbot: {
          name: "수학 챗봇",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "수학",
          topic: "1차 함수",
          learningGoal: "1차 함수의 뜻과 식을 이해한다.",
          hintStrength: "low",
          persona: "질문으로 돕는 수학 선생님"
        }
      })
    });

    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("맞아요");
    expect(body).not.toContain("학생 반응");
    expect(body).not.toContain("현재 상태");
    expect(body).not.toContain("목표");
    expect(body).not.toContain("계획");
    expect(body).not.toContain("질문 생성");
  });

  it("records provider network errors without exposing provider exception details", async () => {
    const { baseUrl, store } = await createServer({
      env: {
        LMSTUDIO_API_KEY: "test-lmstudio-key"
      },
      fetchImpl: async () => {
        throw new Error("network failed with OPENAI_API_KEY=secret-value");
      }
    });
    const teacher = approveTeacher(createTeacher("teacher-2", "teacher2@example.com"), {
      adminId: "local-admin",
      now: "2026-06-13T06:20:00.000Z",
      logId: "admin-log-2"
    }).teacher;
    await store.saveTeacher(teacher);
    const shared = enableShareLink(
      createChatbot(
        {
          ownerTeacherId: teacher.id,
          name: "중학교 국어 품사",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "국어",
          topic: "품사의 종류와 특성",
          learningGoal: "품사의 역할을 문장 속에서 구분한다.",
          hintStrength: "medium",
          persona: "답을 바로 주지 않고 질문으로 돕는 국어 선생님"
        },
        { id: "chatbot-2", now: "2026-06-13T06:21:00.000Z" }
      ),
      {
        actorTeacherId: teacher.id,
        token: "public-token-abcdef"
      }
    );
    await store.saveChatbot(shared);

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "학생 질문 원문: 관형사와 부사의 차이가 궁금해",
        history: [],
        chatbot: { id: "chatbot-2" },
        shareToken: "public-token-abcdef",
        conversationId: "conversation-2"
      })
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: "provider_error",
      message: "응답을 불러오지 못했어요. 잠시 후 다시 시도하거나 선생님께 알려 주세요."
    });
    await expect(store.listProviderErrorLogs()).resolves.toEqual([
      expect.objectContaining({
        provider: "lmstudio",
        code: "NETWORK_ERROR",
        teacherId: "teacher-2",
        chatbotId: "chatbot-2",
        surface: "student_share"
      })
    ]);
    const serializedLogs = JSON.stringify(await store.listProviderErrorLogs());
    expect(serializedLogs).not.toContain("학생 질문 원문");
    expect(serializedLogs).not.toContain("OPENAI_API_KEY");
    expect(serializedLogs).not.toContain("secret-value");
    await expect(store.listUsageSummariesByTeacher("teacher-2")).resolves.toEqual([
      expect.objectContaining({
        teacherId: "teacher-2",
        chatbotId: "chatbot-2",
        conversationCount: 1,
        aiCallCount: 0,
        errorCount: 1
      })
    ]);
  });
});

async function createServer(options: { fetchImpl?: typeof fetch; env?: Record<string, string | undefined> } = {}) {
  const root = await mkdtemp(join(tmpdir(), "api-handler-"));
  tempRoots.push(root);
  const store = createLocalStore(join(root, "store.json"));
  const handler = createApiHandler({
    store,
    schoolSearch: async () => [
      {
        schoolName: "새빛중학교",
        schoolKind: "중학교",
        officeCode: "B10",
        standardSchoolCode: "1234567",
        region: "서울특별시",
        address: "서울특별시 중구 예시로 1"
      }
    ],
    fetchImpl: options.fetchImpl,
    env: options.env
  });
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  openServers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No server address");
  return { baseUrl: `http://127.0.0.1:${address.port}`, store };
}

function createTeacher(id: string, email: string) {
  return registerLocalTeacher(
    {
      realName: "김하늘",
      email,
      passwordHash: "firebase-auth",
      school: {
        schoolName: "새빛중학교",
        schoolKind: "중학교",
        officeCode: "B10",
        standardSchoolCode: "1234567",
        region: "서울"
      }
    },
    { id, now: "2026-06-13T06:09:00.000Z" }
  );
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
