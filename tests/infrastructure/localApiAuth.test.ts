import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalApiHandler } from "../../server/localApi";
import { createLocalStore } from "../../server/localStore";
import type { StorePort } from "../../server/storePort";
import { createChatbot, enableShareLink } from "../../src/domain/chatbot/chatbotManagement";
import { approveTeacher, registerLocalTeacher } from "../../src/domain/identity/identityAccess";

const tempRoots: string[] = [];
const openServers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map(closeServer));
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("localApi production auth", () => {
  it("registers a Firebase teacher profile under the verified uid", async () => {
    const { baseUrl, store } = await createServer();

    const response = await fetch(`${baseUrl}/api/teachers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer teacher-token"
      },
      body: JSON.stringify({
        realName: "김하늘",
        email: "spoofed@example.com",
        passwordHash: "plain-password-should-not-be-stored",
        school: {
          schoolName: "새빛중학교",
          schoolKind: "중학교",
          officeCode: "B10",
          standardSchoolCode: "1234567",
          region: "서울"
        }
      })
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as { teacher: { id: string; passwordHash: string; status: string } };
    expect(payload.teacher).toMatchObject({
      id: "teacher-1",
      email: "teacher@example.com",
      passwordHash: "firebase-auth",
      status: "pending"
    });
    await expect(store.getTeacher("teacher-1")).resolves.toMatchObject({ email: "teacher@example.com" });
  });

  it("bootstraps a configured Firebase email as an admin profile", async () => {
    const { baseUrl, store } = await createServer({
      env: {
        KKOKKOMU_ADMIN_EMAILS: "admin@example.com"
      }
    });

    const response = await fetch(`${baseUrl}/api/teachers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer bootstrap-admin-token"
      },
      body: JSON.stringify({
        realName: "관리자",
        email: "spoofed-admin@example.com",
        passwordHash: "plain-password-should-not-be-stored",
        school: {
          schoolName: "새빛중학교",
          schoolKind: "중학교",
          officeCode: "B10",
          standardSchoolCode: "1234567",
          region: "서울"
        }
      })
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as { teacher: { id: string; email: string; status: string; promotedBy?: string } };
    expect(payload.teacher).toMatchObject({
      id: "firebase-admin-1",
      email: "admin@example.com",
      status: "admin",
      promotedBy: "bootstrap-env"
    });
    await expect(store.getTeacher("firebase-admin-1")).resolves.toMatchObject({ status: "admin", email: "admin@example.com" });
    await expect(store.listAdminActionLogs()).resolves.toContainEqual(
      expect.objectContaining({
        action: "teacher_promoted_to_admin",
        adminId: "bootstrap-env",
        targetTeacherId: "firebase-admin-1"
      })
    );
  });

  it("allows Firebase authorization headers in preflight responses", async () => {
    const { baseUrl } = await createServer();

    const response = await fetch(`${baseUrl}/api/chatbots`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://127.0.0.1:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Authorization"
      }
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:5173");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });

  it("rejects preflight requests from untrusted browser origins", async () => {
    const { baseUrl } = await createServer();

    const response = await fetch(`${baseUrl}/api/chatbots`, {
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

  it("does not expose authenticated responses to untrusted browser origins", async () => {
    const { baseUrl, store } = await createServer();
    await store.saveTeacher(
      approveTeacher(createTeacher("teacher-1", "teacher@example.com"), {
        adminId: "local-admin",
        now: "2026-06-13T01:30:00.000Z",
        logId: "admin-log-1"
      }).teacher
    );

    const response = await fetch(`${baseUrl}/api/teachers`, {
      headers: {
        Authorization: "Bearer teacher-token",
        Origin: "https://evil.example"
      }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("scopes teacher lists to the authenticated teacher unless the requester is an admin", async () => {
    const { baseUrl, store } = await createServer();
    await store.saveTeacher(
      approveTeacher(createTeacher("teacher-1", "teacher@example.com"), {
        adminId: "local-admin",
        now: "2026-06-13T01:30:00.000Z",
        logId: "admin-log-1"
      }).teacher
    );
    await store.saveTeacher(
      approveTeacher(createTeacher("teacher-2", "other@example.com"), {
        adminId: "local-admin",
        now: "2026-06-13T01:31:00.000Z",
        logId: "admin-log-2"
      }).teacher
    );

    const anonymous = await fetch(`${baseUrl}/api/teachers`);
    expect(anonymous.status).toBe(403);

    const teacherResponse = await fetch(`${baseUrl}/api/teachers`, {
      headers: { Authorization: "Bearer teacher-token" }
    });
    const teacherPayload = (await teacherResponse.json()) as { teachers: Array<{ id: string }> };
    expect(teacherPayload.teachers.map((teacher) => teacher.id)).toEqual(["teacher-1"]);

    const adminResponse = await fetch(`${baseUrl}/api/teachers`, {
      headers: { Authorization: "Bearer admin-token" }
    });
    const adminPayload = (await adminResponse.json()) as { teachers: Array<{ id: string }> };
    expect(adminPayload.teachers.map((teacher) => teacher.id).sort()).toEqual(["local-admin", "teacher-1", "teacher-2"]);
  });

  it("does not read every teacher document when a Firebase teacher lists their own profile", async () => {
    const readCounts = { listTeachers: 0 };
    const { baseUrl, store } = await createServer({
      storeWrapper: (baseStore) => ({
        ...baseStore,
        async listTeachers() {
          readCounts.listTeachers += 1;
          return baseStore.listTeachers();
        }
      })
    });
    await store.saveTeacher(
      approveTeacher(createTeacher("teacher-1", "teacher@example.com"), {
        adminId: "local-admin",
        now: "2026-06-13T01:30:00.000Z",
        logId: "admin-log-1"
      }).teacher
    );

    const response = await fetch(`${baseUrl}/api/teachers`, {
      headers: { Authorization: "Bearer teacher-token" }
    });
    const payload = (await response.json()) as { teachers: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(payload.teachers.map((teacher) => teacher.id)).toEqual(["teacher-1"]);
    expect(readCounts.listTeachers).toBe(0);
  });

  it("scopes usage summaries to the authenticated teacher unless the requester is an admin", async () => {
    const { baseUrl, store } = await createServer();
    await store.saveTeacher(
      approveTeacher(createTeacher("teacher-1", "teacher@example.com"), {
        adminId: "local-admin",
        now: "2026-06-13T01:30:00.000Z",
        logId: "admin-log-1"
      }).teacher
    );
    await store.saveTeacher(
      approveTeacher(createTeacher("teacher-2", "other@example.com"), {
        adminId: "local-admin",
        now: "2026-06-13T01:31:00.000Z",
        logId: "admin-log-2"
      }).teacher
    );
    await store.appendUsageEvent({
      id: "usage-1",
      kind: "ai_call",
      provider: "openai",
      modelId: "openai:gpt-5.4-nano",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      conversationId: "conversation-1",
      occurredAt: "2026-06-13T01:32:00.000Z",
      month: "2026-06",
      surface: "student_share",
      inputTextLength: 100,
      outputTextLength: 200,
      inputTokenEstimate: 25,
      outputTokenEstimate: 50,
      estimatedCostUsd: 0.0000675,
      riskCodes: []
    });
    await store.appendUsageEvent({
      id: "usage-2",
      kind: "ai_call",
      provider: "openai",
      modelId: "openai:gpt-5.4-nano",
      teacherId: "teacher-2",
      chatbotId: "chatbot-2",
      conversationId: "conversation-2",
      occurredAt: "2026-06-13T01:33:00.000Z",
      month: "2026-06",
      surface: "student_share",
      inputTextLength: 100,
      outputTextLength: 200,
      inputTokenEstimate: 25,
      outputTokenEstimate: 50,
      estimatedCostUsd: 0.0000675,
      riskCodes: []
    });

    const teacherResponse = await fetch(`${baseUrl}/api/usage`, {
      headers: { Authorization: "Bearer teacher-token" }
    });
    const teacherPayload = (await teacherResponse.json()) as { summaries: Array<{ teacherId: string }> };
    expect(teacherPayload.summaries.map((summary) => summary.teacherId)).toEqual(["teacher-1"]);

    const adminResponse = await fetch(`${baseUrl}/api/usage`, {
      headers: { Authorization: "Bearer admin-token" }
    });
    const adminPayload = (await adminResponse.json()) as { summaries: Array<{ teacherId: string }> };
    expect(adminPayload.summaries.map((summary) => summary.teacherId).sort()).toEqual(["teacher-1", "teacher-2"]);
  });

  it("uses the Firebase token teacher id instead of a spoofed body owner id", async () => {
    const { baseUrl, store } = await createServer();
    await store.saveTeacher(
      approveTeacher(createTeacher("teacher-1", "teacher@example.com"), {
        adminId: "local-admin",
        now: "2026-06-13T01:30:00.000Z",
        logId: "admin-log-1"
      }).teacher
    );

    const response = await fetch(`${baseUrl}/api/chatbots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer teacher-token"
      },
      body: JSON.stringify({
        ownerTeacherId: "spoofed-teacher",
        name: "중학교 국어 품사",
        schoolLevel: "middle",
        gradeBand: "1",
        subject: "국어",
        topic: "품사의 종류와 특성",
        learningGoal: "품사의 역할을 문장 속에서 구분한다.",
        hintStrength: "medium",
        persona: "답을 바로 주지 않고 질문으로 돕는 국어 선생님"
      })
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as { chatbot: { ownerTeacherId: string } };
    expect(payload.chatbot.ownerTeacherId).toBe("teacher-1");
  });

  it("rejects admin mutations even when a body adminId is spoofed without an admin token", async () => {
    const { baseUrl, store } = await createServer();
    await store.saveTeacher(createTeacher("teacher-1", "teacher@example.com"));

    const response = await fetch(`${baseUrl}/api/admin/ai-settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer teacher-token"
      },
      body: JSON.stringify({
        adminId: "local-admin",
        modelId: "lmstudio:gemma-4-12b-it"
      })
    });

    expect(response.status).toBe(403);
  });

  it("lets an admin send a Firebase password reset email through a server-side sender and logs the action", async () => {
    const sentEmails: string[] = [];
    const { baseUrl, store } = await createServer({
      passwordResetEmail: async (email) => {
        sentEmails.push(email);
      }
    });
    await store.saveTeacher(
      approveTeacher(createTeacher("teacher-1", "Teacher@Example.COM"), {
        adminId: "local-admin",
        now: "2026-06-13T01:30:00.000Z",
        logId: "admin-log-1"
      }).teacher
    );

    const response = await fetch(`${baseUrl}/api/admin/teachers/teacher-1/password-reset`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-token"
      },
      body: JSON.stringify({
        adminId: "spoofed-admin"
      })
    });
    const payload = (await response.json()) as { action: { email: string; adminId: string; type: string } };

    expect(response.status).toBe(200);
    expect(sentEmails).toEqual(["teacher@example.com"]);
    expect(payload.action).toMatchObject({
      type: "send_password_reset_email",
      email: "teacher@example.com",
      adminId: "local-admin"
    });
    await expect(store.listAdminActionLogs()).resolves.toContainEqual(
      expect.objectContaining({
        action: "password_reset_requested",
        adminId: "local-admin",
        targetTeacherId: "teacher-1"
      })
    );
  });

  it("lets an admin disable a teacher account through a server-side action log", async () => {
    const { baseUrl, store } = await createServer();
    await store.saveTeacher(
      approveTeacher(createTeacher("teacher-1", "teacher@example.com"), {
        adminId: "local-admin",
        now: "2026-06-13T01:30:00.000Z",
        logId: "admin-log-1"
      }).teacher
    );

    const response = await fetch(`${baseUrl}/api/admin/teachers/teacher-1/disable`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-token"
      },
      body: JSON.stringify({
        adminId: "spoofed-admin"
      })
    });
    const payload = (await response.json()) as { teacher: { status: string; disabledBy: string } };

    expect(response.status).toBe(200);
    expect(payload.teacher).toMatchObject({
      status: "disabled",
      disabledBy: "local-admin"
    });
    await expect(store.getTeacher("teacher-1")).resolves.toMatchObject({
      status: "disabled",
      disabledBy: "local-admin"
    });
    await expect(store.listAdminActionLogs()).resolves.toContainEqual(
      expect.objectContaining({
        action: "teacher_disabled",
        adminId: "local-admin",
        targetTeacherId: "teacher-1"
      })
    );
  });

  it("lets an admin reject a pending teacher with a server-side action log and read admin logs", async () => {
    const { baseUrl, store } = await createServer();
    await store.saveTeacher(createTeacher("teacher-1", "teacher@example.com"));

    const rejectResponse = await fetch(`${baseUrl}/api/admin/teachers/teacher-1/reject`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-token"
      },
      body: JSON.stringify({
        adminId: "spoofed-admin",
        reason: "학교 정보 확인 필요"
      })
    });
    const rejectPayload = (await rejectResponse.json()) as { teacher: { status: string; rejectionReason: string; rejectedBy: string } };

    expect(rejectResponse.status).toBe(200);
    expect(rejectPayload.teacher).toMatchObject({
      status: "rejected",
      rejectionReason: "학교 정보 확인 필요",
      rejectedBy: "local-admin"
    });

    const logsResponse = await fetch(`${baseUrl}/api/admin/action-logs`, {
      headers: {
        Authorization: "Bearer admin-token"
      }
    });
    const logsPayload = (await logsResponse.json()) as { logs: Array<{ action: string; adminId: string; targetTeacherId: string; reason?: string }> };

    expect(logsResponse.status).toBe(200);
    expect(logsPayload.logs).toContainEqual(
      expect.objectContaining({
        action: "teacher_rejected",
        adminId: "local-admin",
        targetTeacherId: "teacher-1",
        reason: "rejection_reason_recorded_on_teacher"
      })
    );
    expect(JSON.stringify(logsPayload)).not.toContain("학교 정보 확인 필요");
    await expect(store.getTeacher("teacher-1")).resolves.toMatchObject({ status: "rejected" });
  });

  it("lets an admin disable a problematic chatbot and remove its share token", async () => {
    const { baseUrl, store } = await createServer();
    await store.saveTeacher(
      approveTeacher(createTeacher("teacher-1", "teacher@example.com"), {
        adminId: "local-admin",
        now: "2026-06-13T01:30:00.000Z",
        logId: "admin-log-1"
      }).teacher
    );
    const shared = enableShareLink(
      createChatbot(
        {
          ownerTeacherId: "teacher-1",
          name: "중학교 국어 품사",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "국어",
          topic: "품사의 종류와 특성",
          learningGoal: "품사의 역할을 문장 속에서 구분한다.",
          hintStrength: "medium",
          persona: "답을 바로 주지 않고 질문으로 돕는 국어 선생님"
        },
        { id: "chatbot-1", now: "2026-06-13T01:31:00.000Z" }
      ),
      {
        actorTeacherId: "teacher-1",
        token: "public-token-123456"
      }
    );
    await store.saveChatbot(shared);

    const response = await fetch(`${baseUrl}/api/admin/chatbots/chatbot-1/disable`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-token"
      },
      body: JSON.stringify({
        adminId: "spoofed-admin"
      })
    });
    const payload = (await response.json()) as { chatbot: { lifecycle: { status: string }; share: { enabled: boolean } } };

    expect(response.status).toBe(200);
    expect(payload.chatbot.lifecycle.status).toBe("disabled");
    expect(payload.chatbot.share.enabled).toBe(false);
    await expect(store.findChatbotByShareToken("public-token-123456")).resolves.toBeUndefined();
    await expect(store.listAdminActionLogs()).resolves.toContainEqual(
      expect.objectContaining({
        action: "chatbot_disabled",
        adminId: "local-admin",
        targetTeacherId: "teacher-1",
        targetChatbotId: "chatbot-1"
      })
    );

    const sharedResponse = await fetch(`${baseUrl}/api/share/public-token-123456`);
    expect(sharedResponse.status).toBe(404);
  });
});

async function createServer(
  options: {
    env?: Record<string, string | undefined>;
    storeWrapper?: (store: StorePort) => StorePort;
    passwordResetEmail?: (email: string) => Promise<void>;
  } = {}
) {
  const root = await mkdtemp(join(tmpdir(), "local-api-auth-"));
  tempRoots.push(root);
  const store = createLocalStore(join(root, "store.json"));
  const apiStore = options.storeWrapper ? options.storeWrapper(store) : store;
  const handler = createLocalApiHandler({
    store: apiStore,
    env: options.env,
    passwordResetEmail: options.passwordResetEmail,
    auth: {
      requireFirebaseAuth: true,
      verifyIdToken: async (token) => {
        if (token === "teacher-token") return { uid: "teacher-1", email: "teacher@example.com" };
        if (token === "other-teacher-token") return { uid: "teacher-2", email: "other@example.com" };
        if (token === "admin-token") return { uid: "local-admin", email: "admin@example.com" };
        if (token === "bootstrap-admin-token") return { uid: "firebase-admin-1", email: "admin@example.com" };
        throw new Error("invalid_token");
      }
    }
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
    { id, now: "2026-06-13T01:29:00.000Z" }
  );
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
