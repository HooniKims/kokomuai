import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalApiHandler, type SchoolSearchDependency } from "../../server/localApi";
import { createLocalStore } from "../../server/localStore";
import type { CurriculumIndex } from "../../server/curriculumIndex";
import { createUsageEvent } from "../../src/domain/usage/usageAccounting";

const tempRoots: string[] = [];
const openServers: http.Server[] = [];
const blockedFetchPorts = new Set([6000]);

async function createTestServer(options: { curriculumIndex?: CurriculumIndex; schoolSearch?: SchoolSearchDependency } = {}) {
  const root = await mkdtemp(join(tmpdir(), "local-api-"));
  tempRoots.push(root);
  const store = createLocalStore(join(root, "store.json"));
  const handler = createLocalApiHandler({ store, curriculumIndex: options.curriculumIndex, schoolSearch: options.schoolSearch });
  const server = await listenOnFetchablePort(handler);
  openServers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  return {
    store,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function listenOnFetchablePort(handler: http.RequestListener): Promise<http.Server> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test server address");
    if (!blockedFetchPorts.has(address.port)) return server;
    await closeServer(server);
  }

  throw new Error("Could not allocate a fetchable test server port");
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

afterEach(async () => {
  await Promise.all(openServers.splice(0).map(closeServer));
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function readJson(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("localApi", () => {
  it("returns selectable schools from the server-side school search dependency", async () => {
    const { baseUrl } = await createTestServer({
      schoolSearch: async (query) => {
        expect(query).toBe("새빛중");
        return [
          {
            schoolName: "새빛중학교",
            schoolKind: "중학교",
            officeCode: "B10",
            standardSchoolCode: "1234567",
            region: "서울특별시",
            address: "서울특별시 중구 예시로 1"
          }
        ];
      }
    });

    const response = await fetch(`${baseUrl}/api/schools/search?q=${encodeURIComponent("새빛중")}`);
    const payload = (await readJson(response)) as { schools: Array<{ schoolName: string; standardSchoolCode: string }> };

    expect(response.status).toBe(200);
    expect(payload.schools).toEqual([
      expect.objectContaining({
        schoolName: "새빛중학교",
        standardSchoolCode: "1234567"
      })
    ]);
  });

  it("does not call the server-side school search dependency for blank or one-letter queries", async () => {
    const calls: string[] = [];
    const { baseUrl } = await createTestServer({
      schoolSearch: async (query) => {
        calls.push(query);
        return [
          {
            schoolName: "새빛중학교",
            schoolKind: "중학교",
            officeCode: "B10",
            standardSchoolCode: "1234567",
            region: "서울특별시",
            address: "서울특별시 중구 예시로 1"
          }
        ];
      }
    });

    const blankResponse = await fetch(`${baseUrl}/api/schools/search?q=%20`);
    const oneLetterResponse = await fetch(`${baseUrl}/api/schools/search?q=${encodeURIComponent("서")}`);

    expect(blankResponse.status).toBe(200);
    expect(oneLetterResponse.status).toBe(200);
    await expect(blankResponse.json()).resolves.toEqual({ schools: [] });
    await expect(oneLetterResponse.json()).resolves.toEqual({ schools: [] });
    expect(calls).toEqual([]);
  });

  it("does not expose internal server error details from public school search failures", async () => {
    const { baseUrl } = await createTestServer({
      schoolSearch: async () => {
        throw new Error("NEIS_API_KEY=secret-value failed upstream");
      }
    });

    const response = await fetch(`${baseUrl}/api/schools/search?q=${encodeURIComponent("새빛중")}`);
    const payload = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      error: "local_api_error",
      message: "요청을 처리하는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요."
    });
    expect(JSON.stringify(payload)).not.toContain("NEIS_API_KEY");
    expect(JSON.stringify(payload)).not.toContain("secret-value");
  });

  it("lets an admin read and update AI model settings", async () => {
    const { baseUrl } = await createTestServer();

    const readResponse = await fetch(`${baseUrl}/api/admin/ai-settings`);
    const readPayload = (await readJson(readResponse)) as { settings: { activeModelId: string }; models: Array<{ id: string }> };

    expect(readResponse.status).toBe(200);
    expect(readPayload.settings.activeModelId).toBe("lmstudio:gemma-4-12b-it");
    expect(readPayload.models.map((model) => model.id)).toContain("lmstudio:gemma-4-12b-it");

    const updateResponse = await fetch(`${baseUrl}/api/admin/ai-settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminId: "local-admin",
        modelId: "openai:gpt-5.4-nano"
      })
    });
    const updatePayload = (await readJson(updateResponse)) as { settings: { activeModelId: string; updatedBy: string } };

    expect(updateResponse.status).toBe(200);
    expect(updatePayload.settings).toMatchObject({
      activeModelId: "openai:gpt-5.4-nano",
      updatedBy: "local-admin"
    });
  });

  it("rejects AI setting changes from non-admin actors", async () => {
    const { baseUrl } = await createTestServer();

    const updateResponse = await fetch(`${baseUrl}/api/admin/ai-settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminId: "missing-admin",
        modelId: "lmstudio:gemma-4-12b-it"
      })
    });

    expect(updateResponse.status).toBe(403);
  });

  it("registers and approves a local teacher through API routes", async () => {
    const { baseUrl } = await createTestServer();

    const registerResponse = await fetch(`${baseUrl}/api/teachers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        realName: "김하늘",
        email: "Teacher@Example.COM",
        passwordHash: "argon2id$hashed-password",
        school: {
          schoolName: "한빛초등학교",
          schoolKind: "초등학교",
          officeCode: "B10",
          standardSchoolCode: "1234567",
          region: "서울"
        }
      })
    });

    expect(registerResponse.status).toBe(201);
    const registered = (await readJson(registerResponse)) as { teacher: { id: string; status: string; email: string } };
    expect(registered.teacher.status).toBe("pending");
    expect(registered.teacher.email).toBe("teacher@example.com");

    const approveResponse = await fetch(`${baseUrl}/api/admin/teachers/${registered.teacher.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId: "local-admin" })
    });

    expect(approveResponse.status).toBe(200);
    const approved = (await readJson(approveResponse)) as { teacher: { status: string }; event: { action: string } };
    expect(approved.teacher.status).toBe("approved");
    expect(approved.event.action).toBe("teacher_approved");

    const listResponse = await fetch(`${baseUrl}/api/teachers`);
    const listed = (await readJson(listResponse)) as { teachers: Array<{ id: string; status: string }> };
    expect(listed.teachers.some((teacher) => teacher.id === registered.teacher.id && teacher.status === "approved")).toBe(true);
  });

  it("rejects oversized teacher registration payloads before saving anything", async () => {
    const { baseUrl, store } = await createTestServer();

    const response = await fetch(`${baseUrl}/api/teachers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        realName: "김하늘",
        email: "teacher@example.com",
        passwordHash: "argon2id$hashed-password",
        school: {
          schoolName: `한빛초등학교${"가".repeat(140 * 1024)}`,
          schoolKind: "초등학교",
          officeCode: "B10",
          standardSchoolCode: "1234567",
          region: "서울"
        }
      })
    });

    expect(response.status).toBe(413);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: "payload_too_large"
    });
    await expect(store.listTeachers()).resolves.toHaveLength(1);
  });

  it("requires an existing admin actor before approving a teacher", async () => {
    const { baseUrl } = await createTestServer();

    const registerResponse = await fetch(`${baseUrl}/api/teachers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        realName: "김하늘",
        email: "teacher@example.com",
        passwordHash: "argon2id$hashed-password",
        school: {
          schoolName: "한빛초등학교",
          schoolKind: "초등학교",
          officeCode: "B10",
          standardSchoolCode: "1234567",
          region: "서울"
        }
      })
    });
    const registered = (await readJson(registerResponse)) as { teacher: { id: string } };

    const missingAdminResponse = await fetch(`${baseUrl}/api/admin/teachers/${registered.teacher.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    expect(missingAdminResponse.status).toBe(403);

    const pendingTeacherResponse = await fetch(`${baseUrl}/api/admin/teachers/${registered.teacher.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId: registered.teacher.id })
    });
    expect(pendingTeacherResponse.status).toBe(403);
  });

  it("deduplicates concurrent teacher registration by normalized email", async () => {
    const { baseUrl } = await createTestServer();
    const request = {
      realName: "김하늘",
      email: " Teacher@Example.COM ",
      passwordHash: "argon2id$hashed-password",
      school: {
        schoolName: "한빛초등학교",
        schoolKind: "초등학교",
        officeCode: "B10",
        standardSchoolCode: "1234567",
        region: "서울"
      }
    };

    const [firstResponse, secondResponse] = await Promise.all([
      fetch(`${baseUrl}/api/teachers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      }),
      fetch(`${baseUrl}/api/teachers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      })
    ]);

    expect([firstResponse.status, secondResponse.status].sort()).toEqual([200, 201]);
    const first = (await readJson(firstResponse)) as { teacher: { id: string; email: string } };
    const second = (await readJson(secondResponse)) as { teacher: { id: string; email: string } };
    expect(first.teacher.id).toBe(second.teacher.id);
    expect(first.teacher.email).toBe("teacher@example.com");

    const listResponse = await fetch(`${baseUrl}/api/teachers`);
    const listed = (await readJson(listResponse)) as { teachers: Array<{ id: string; email: string }> };
    expect(listed.teachers.filter((teacher) => teacher.email === "teacher@example.com")).toHaveLength(1);
  });

  it("approves a teacher idempotently when duplicate approval requests race", async () => {
    const { baseUrl, store } = await createTestServer();

    const registerResponse = await fetch(`${baseUrl}/api/teachers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        realName: "김하늘",
        email: "teacher@example.com",
        passwordHash: "argon2id$hashed-password",
        school: {
          schoolName: "한빛초등학교",
          schoolKind: "초등학교",
          officeCode: "B10",
          standardSchoolCode: "1234567",
          region: "서울"
        }
      })
    });
    const registered = (await readJson(registerResponse)) as { teacher: { id: string } };

    const [firstApproval, secondApproval] = await Promise.all([
      fetch(`${baseUrl}/api/admin/teachers/${registered.teacher.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId: "local-admin" })
      }),
      fetch(`${baseUrl}/api/admin/teachers/${registered.teacher.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId: "local-admin" })
      })
    ]);

    expect(firstApproval.status).toBe(200);
    expect(secondApproval.status).toBe(200);
    const teacher = await store.getTeacher(registered.teacher.id);
    expect(teacher?.status).toBe("approved");
    const approvalLogs = (await store.listAdminActionLogs()).filter((event) => event.targetTeacherId === registered.teacher.id);
    expect(approvalLogs).toHaveLength(1);
    expect(approvalLogs[0].action).toBe("teacher_approved");
  });

  it("creates a chatbot, enables sharing, and resolves the student share token", async () => {
    const { baseUrl } = await createTestServer();
    const teacherResponse = await fetch(`${baseUrl}/api/teachers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        realName: "김하늘",
        email: "teacher@example.com",
        passwordHash: "argon2id$hashed-password",
        school: {
          schoolName: "한빛초등학교",
          schoolKind: "초등학교",
          officeCode: "B10",
          standardSchoolCode: "1234567",
          region: "서울"
        }
      })
    });
    const teacherPayload = (await readJson(teacherResponse)) as { teacher: { id: string } };
    await fetch(`${baseUrl}/api/admin/teachers/${teacherPayload.teacher.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId: "local-admin" })
    });

    const chatbotResponse = await fetch(`${baseUrl}/api/chatbots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerTeacherId: teacherPayload.teacher.id,
        name: "전기 회로 탐구",
        schoolLevel: "elementary",
        gradeBand: "5-6",
        subject: "과학",
        topic: "전기 회로에서 전구가 켜지는 조건",
        learningGoal: "학생이 전구가 켜지는 조건을 스스로 설명하도록 돕는다.",
        hintStrength: "medium",
        persona: "친절하지만 답을 바로 말하지 않는 과학 선생님"
      })
    });

    expect(chatbotResponse.status).toBe(201);
    const chatbotPayload = (await readJson(chatbotResponse)) as { chatbot: { id: string } };

    const shareResponse = await fetch(`${baseUrl}/api/chatbots/${chatbotPayload.chatbot.id}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorTeacherId: teacherPayload.teacher.id,
        token: "abc123xyz789abc123xyz789",
        expiresAt: "2026-06-18"
      })
    });

    expect(shareResponse.status).toBe(200);
    const sharePayload = (await readJson(shareResponse)) as { chatbot: { share: { publicToken: string } } };
    expect(sharePayload.chatbot.share.publicToken).toBe("abc123xyz789abc123xyz789");

    const sharedResponse = await fetch(`${baseUrl}/api/share/abc123xyz789abc123xyz789?now=2026-06-18T10:00:00.000Z`);
    expect(sharedResponse.status).toBe(200);
    const sharedPayload = (await readJson(sharedResponse)) as { chatbot: { id: string; topic: string; share: { publicToken: string } } };
    expect(sharedPayload.chatbot.id).toBe(chatbotPayload.chatbot.id);
    expect(sharedPayload.chatbot.topic).toContain("전구");
    expect(sharedPayload.chatbot.share.publicToken).toBe("abc123xyz789abc123xyz789");
    expect(JSON.stringify(sharedPayload.chatbot)).not.toContain("ownerTeacherId");
    expect(JSON.stringify(sharedPayload.chatbot)).not.toContain("lifecycle");
    expect(JSON.stringify(sharedPayload.chatbot)).not.toContain("createdAt");
    expect(JSON.stringify(sharedPayload.chatbot)).not.toContain("updatedAt");

    const listResponse = await fetch(`${baseUrl}/api/chatbots?ownerTeacherId=${teacherPayload.teacher.id}`);
    expect(listResponse.status).toBe(200);
    const listed = (await readJson(listResponse)) as { chatbots: Array<{ id: string; ownerTeacherId: string }> };
    expect(listed.chatbots).toEqual([
      expect.objectContaining({
        id: chatbotPayload.chatbot.id,
        ownerTeacherId: teacherPayload.teacher.id
      })
    ]);
  });

  it("updates and deletes a chatbot through owner-only API routes", async () => {
    const { baseUrl } = await createTestServer();
    const teacherResponse = await fetch(`${baseUrl}/api/teachers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        realName: "김하늘",
        email: "teacher@example.com",
        passwordHash: "argon2id$hashed-password",
        school: {
          schoolName: "한빛초등학교",
          schoolKind: "초등학교",
          officeCode: "B10",
          standardSchoolCode: "1234567",
          region: "서울"
        }
      })
    });
    const teacherPayload = (await readJson(teacherResponse)) as { teacher: { id: string } };
    await fetch(`${baseUrl}/api/admin/teachers/${teacherPayload.teacher.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId: "local-admin" })
    });

    const chatbotResponse = await fetch(`${baseUrl}/api/chatbots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerTeacherId: teacherPayload.teacher.id,
        name: "전기 회로 탐구",
        schoolLevel: "elementary",
        gradeBand: "5-6",
        subject: "과학",
        topic: "전기 회로에서 전구가 켜지는 조건",
        learningGoal: "학생이 전구가 켜지는 조건을 스스로 설명하도록 돕는다.",
        hintStrength: "medium",
        persona: "친절하지만 답을 바로 말하지 않는 과학 선생님"
      })
    });
    const chatbotPayload = (await readJson(chatbotResponse)) as { chatbot: { id: string } };

    const forbiddenUpdate = await fetch(`${baseUrl}/api/chatbots/${chatbotPayload.chatbot.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorTeacherId: "other-teacher",
        patch: { name: "다른 이름" }
      })
    });
    expect(forbiddenUpdate.status).toBe(403);

    const updateResponse = await fetch(`${baseUrl}/api/chatbots/${chatbotPayload.chatbot.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorTeacherId: teacherPayload.teacher.id,
        patch: {
          name: "물의 상태 변화 탐구",
          topic: "물이 얼고 녹는 조건 관찰"
        }
      })
    });
    expect(updateResponse.status).toBe(200);
    const updated = (await readJson(updateResponse)) as { chatbot: { name: string; topic: string } };
    expect(updated.chatbot.name).toBe("물의 상태 변화 탐구");
    expect(updated.chatbot.topic).toContain("얼고");

    const shareResponse = await fetch(`${baseUrl}/api/chatbots/${chatbotPayload.chatbot.id}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorTeacherId: teacherPayload.teacher.id,
        token: "delete-test-token-123456"
      })
    });
    const shared = (await readJson(shareResponse)) as { chatbot: { share: { publicToken: string } } };

    const deleteResponse = await fetch(`${baseUrl}/api/chatbots/${chatbotPayload.chatbot.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorTeacherId: teacherPayload.teacher.id })
    });
    expect(deleteResponse.status).toBe(200);
    const deleted = (await readJson(deleteResponse)) as { chatbot: { lifecycle: { status: string }; share: { enabled: boolean } } };
    expect(deleted.chatbot.lifecycle.status).toBe("deleted");
    expect(deleted.chatbot.share.enabled).toBe(false);

    const deletedShare = await fetch(`${baseUrl}/api/share/${shared.chatbot.share.publicToken}`);
    expect(deletedShare.status).toBe(404);

    const listAfterDeleteResponse = await fetch(`${baseUrl}/api/chatbots?ownerTeacherId=${teacherPayload.teacher.id}`);
    expect(listAfterDeleteResponse.status).toBe(200);
    const listAfterDelete = (await readJson(listAfterDeleteResponse)) as { chatbots: Array<{ id: string }> };
    expect(listAfterDelete.chatbots.some((chatbot) => chatbot.id === chatbotPayload.chatbot.id)).toBe(false);
  });

  it("blocks sharing when the actor teacher can no longer use teacher features", async () => {
    const { baseUrl, store } = await createTestServer();
    const teacherResponse = await fetch(`${baseUrl}/api/teachers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        realName: "김하늘",
        email: "teacher@example.com",
        passwordHash: "argon2id$hashed-password",
        school: {
          schoolName: "한빛초등학교",
          schoolKind: "초등학교",
          officeCode: "B10",
          standardSchoolCode: "1234567",
          region: "서울"
        }
      })
    });
    const teacherPayload = (await readJson(teacherResponse)) as { teacher: { id: string } };
    await fetch(`${baseUrl}/api/admin/teachers/${teacherPayload.teacher.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId: "local-admin" })
    });

    const chatbotResponse = await fetch(`${baseUrl}/api/chatbots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerTeacherId: teacherPayload.teacher.id,
        name: "전기 회로 탐구",
        schoolLevel: "elementary",
        gradeBand: "5-6",
        subject: "과학",
        topic: "전기 회로에서 전구가 켜지는 조건",
        learningGoal: "학생이 전구가 켜지는 조건을 스스로 설명하도록 돕는다.",
        hintStrength: "medium",
        persona: "친절하지만 답을 바로 말하지 않는 과학 선생님"
      })
    });
    const chatbotPayload = (await readJson(chatbotResponse)) as { chatbot: { id: string } };

    const approvedTeacher = await store.getTeacher(teacherPayload.teacher.id);
    if (!approvedTeacher) throw new Error("Expected approved teacher");
    await store.saveTeacher({
      ...approvedTeacher,
      status: "disabled",
      disabledAt: "2026-06-12T10:00:00.000Z",
      disabledBy: "local-admin"
    });

    const shareResponse = await fetch(`${baseUrl}/api/chatbots/${chatbotPayload.chatbot.id}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorTeacherId: teacherPayload.teacher.id,
        token: "abc123xyz789abc123xyz789"
      })
    });

    expect(shareResponse.status).toBe(403);
  });

  it("returns usage summaries and logs without student raw text", async () => {
    const { baseUrl, store } = await createTestServer();
    await store.appendUsageEvent(
      createUsageEvent({
        id: "usage-1",
        teacherId: "teacher-1",
        chatbotId: "chatbot-1",
        conversationId: "conversation-1",
        occurredAt: "2026-06-12T10:00:00.000Z",
        surface: "student_share",
        inputText: "학생 질문 원문",
        outputText: "교사 챗봇 응답 원문"
      })
    );
    await store.appendProviderErrorLog({
      id: "provider-error-1",
      occurredAt: "2026-06-12T10:00:00.000Z",
      provider: "lmstudio",
      status: 502,
      code: "BAD_GATEWAY",
      message: "Local provider failed",
      studentConversation: "학생 원문"
    });

    const usageResponse = await fetch(`${baseUrl}/api/usage`);
    expect(usageResponse.status).toBe(200);
    expect(usageResponse.headers.get("Cache-Control")).toBe("no-store");
    const usagePayload = await readJson(usageResponse);
    expect(JSON.stringify(usagePayload)).toContain("summaries");
    expect(JSON.stringify(usagePayload)).not.toContain("events");
    expect(JSON.stringify(usagePayload)).not.toContain("학생 질문 원문");

    const logsResponse = await fetch(`${baseUrl}/api/admin/provider-errors`);
    expect(logsResponse.status).toBe(200);
    expect(logsResponse.headers.get("Cache-Control")).toBe("no-store");
    const logsPayload = await readJson(logsResponse);
    expect(JSON.stringify(logsPayload)).toContain("provider-error-1");
    expect(JSON.stringify(logsPayload)).not.toContain("학생 원문");
  });

  it("returns curriculum recommendations from the injected curriculum index", async () => {
    const { baseUrl } = await createTestServer({
      curriculumIndex: {
        chunks: [],
        search: (topic) =>
          topic.includes("전구")
            ? [
                {
                  id: "science-circuit",
                  chunkId: "science-circuit",
                  sourceTitle: "2022 개정 과학과 교육과정 [별책9]",
                  schoolLevel: "elementary",
                  gradeBand: "5-6",
                  subject: "과학",
                  area: "전기와 자기",
                  achievement: "전구가 켜지는 조건을 탐구한다.",
                  excerpt: "전지, 전구, 전선을 연결한다.",
                  sectionPath: "과학 > 전기와 자기",
                  matchedTerms: ["전구"],
                  score: 5
                }
              ]
            : []
      }
    });

    const response = await fetch(
      `${baseUrl}/api/curriculum/recommend?topic=${encodeURIComponent("전구가 켜지는 조건")}&schoolLevel=elementary&gradeBand=5-6`
    );

    expect(response.status).toBe(200);
    const payload = (await readJson(response)) as { recommendations: Array<{ chunkId: string; label: string; chunk: { achievement: string } }> };
    expect(payload.recommendations).toEqual([
      expect.objectContaining({
        chunkId: "science-circuit",
        label: "추천",
        matchedTerms: ["전구"],
        chunk: expect.objectContaining({
          achievement: "전구가 켜지는 조건을 탐구한다."
        })
      })
    ]);
  });

  it("filters curriculum recommendations by school level and grade band", async () => {
    const { baseUrl } = await createTestServer({
      curriculumIndex: {
        chunks: [],
        search: () => [
          {
            id: "science-elementary",
            chunkId: "science-elementary",
            sourceTitle: "과학",
            schoolLevel: "elementary",
            gradeBand: "5-6",
            subject: "과학",
            area: "전기",
            achievement: "초등 전구 조건",
            excerpt: "전구",
            sectionPath: "초등",
            matchedTerms: ["전구"],
            score: 5
          },
          {
            id: "science-high",
            chunkId: "science-high",
            sourceTitle: "과학",
            schoolLevel: "high",
            gradeBand: "all",
            subject: "과학",
            area: "전기",
            achievement: "고등 전기 조건",
            excerpt: "전구",
            sectionPath: "고등",
            matchedTerms: ["전구"],
            score: 5
          }
        ]
      }
    });

    const response = await fetch(
      `${baseUrl}/api/curriculum/recommend?topic=${encodeURIComponent("전구 조건")}&schoolLevel=elementary&gradeBand=5-6`
    );
    const payload = (await readJson(response)) as { recommendations: Array<{ chunkId: string }> };

    expect(payload.recommendations.map((item) => item.chunkId)).toEqual(["science-elementary"]);
  });

  it("matches a single middle school grade against a 1-3 curriculum grade band", async () => {
    const { baseUrl } = await createTestServer({
      curriculumIndex: {
        chunks: [],
        search: () => [
          {
            id: "korean-middle",
            chunkId: "korean-middle",
            sourceTitle: "국어",
            schoolLevel: "middle",
            gradeBand: "1-3",
            subject: "국어",
            area: "문법",
            achievement: "품사의 종류와 특성을 이해한다.",
            excerpt: "품사",
            sectionPath: "중학교 > 문법",
            matchedTerms: ["품사"],
            score: 5
          }
        ]
      }
    });

    const response = await fetch(
      `${baseUrl}/api/curriculum/recommend?topic=${encodeURIComponent("중1 국어 9품사")}&schoolLevel=middle&gradeBand=1`
    );
    const payload = (await readJson(response)) as { recommendations: Array<{ chunkId: string }> };

    expect(payload.recommendations.map((item) => item.chunkId)).toEqual(["korean-middle"]);
  });

  it("filters curriculum recommendations by subject when the teacher sample provides one", async () => {
    const { baseUrl } = await createTestServer({
      curriculumIndex: {
        chunks: [],
        search: () => [
          {
            id: "korean-middle",
            chunkId: "korean-middle",
            sourceTitle: "국어",
            schoolLevel: "middle",
            gradeBand: "1-3",
            subject: "국어",
            area: "문법",
            achievement: "[9국04-03] 품사의 종류와 특성을 이해한다.",
            excerpt: "품사",
            sectionPath: "중학교 > 문법",
            matchedTerms: ["국어", "품사"],
            score: 13
          },
          {
            id: "practical-arts-middle",
            chunkId: "practical-arts-middle",
            sourceTitle: "실과",
            schoolLevel: "middle",
            gradeBand: "1-3",
            subject: "실과(기술가정)정보",
            area: "생활환경",
            achievement: "[9기가02-01] 생활자원의 종류와 특성을 이해한다.",
            excerpt: "종류와 특성",
            sectionPath: "중학교 > 생활환경",
            matchedTerms: ["종류", "특성"],
            score: 7
          }
        ]
      }
    });

    const response = await fetch(
      `${baseUrl}/api/curriculum/recommend?topic=${encodeURIComponent("중학교 국어 품사의 종류와 특성")}&schoolLevel=middle&gradeBand=1&subject=${encodeURIComponent("국어")}`
    );
    const payload = (await readJson(response)) as { recommendations: Array<{ chunkId: string }> };

    expect(payload.recommendations.map((item) => item.chunkId)).toEqual(["korean-middle"]);
  });

  it("keeps vocational high professional curriculum with all grade band in recommendations", async () => {
    const { baseUrl } = await createTestServer({
      curriculumIndex: {
        chunks: [],
        search: () => [
          {
            id: "professional-career",
            chunkId: "professional-career",
            sourceTitle: "전문교과",
            schoolLevel: "vocational_high",
            gradeBand: "all",
            subject: "전기·전자 전문 교과",
            area: "",
            achievement: "[성직 01-01] 일과 직업의 의미를 안다.",
            excerpt: "직업",
            sectionPath: "직업계고 전문교과 > 성공적인 직업 생활",
            matchedTerms: ["직업"],
            score: 5
          }
        ]
      }
    });

    const response = await fetch(
      `${baseUrl}/api/curriculum/recommend?topic=${encodeURIComponent("직업 생활")}&schoolLevel=vocational_high&gradeBand=2`
    );
    const payload = (await readJson(response)) as { recommendations: Array<{ chunkId: string; reason: string }> };

    expect(payload.recommendations.map((item) => item.chunkId)).toEqual(["professional-career"]);
    expect(payload.recommendations[0].reason).toBe("전기·전자 전문 교과 영역에서 수업 주제와 연결되는 성취기준입니다.");
  });
});
