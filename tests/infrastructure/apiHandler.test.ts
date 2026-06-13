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
      error: "provider_error"
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
      error: "provider_error"
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

