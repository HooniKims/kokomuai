import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalStore } from "../../server/localStore";
import { approveTeacher, registerLocalTeacher } from "../../src/domain/identity/identityAccess";
import { createChatbot, enableShareLink } from "../../src/domain/chatbot/chatbotManagement";
import { updateAiSettingsModel } from "../../src/domain/ai/aiSettings";
import { createUsageEvent } from "../../src/domain/usage/usageAccounting";

const tempRoots: string[] = [];

async function tempStorePath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "local-store-"));
  tempRoots.push(root);
  return join(root, "store.json");
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const selectedSchool = {
  schoolName: "한빛초등학교",
  schoolKind: "초등학교",
  officeCode: "B10",
  standardSchoolCode: "1234567",
  region: "서울"
};

const teacher = () =>
  registerLocalTeacher(
    {
      realName: "김하늘",
      email: "teacher@example.com",
      passwordHash: "argon2id$hashed-password",
      school: selectedSchool
    },
    { id: "teacher-1", now: "2026-06-11T10:00:00.000Z" }
  );

const chatbot = () =>
  createChatbot(
    {
      ownerTeacherId: "teacher-1",
      name: "전기 회로 탐구",
      schoolLevel: "elementary",
      gradeBand: "5-6",
      subject: "과학",
      topic: "전기 회로에서 전구가 켜지는 조건",
      learningGoal: "학생이 전구가 켜지는 조건을 스스로 설명하도록 돕는다.",
      hintStrength: "medium",
      persona: "친절하지만 답을 바로 말하지 않는 과학 선생님"
    },
    { id: "chatbot-1", now: "2026-06-11T10:00:00.000Z" }
  );

describe("localStore", () => {
  it("creates seed data in a missing JSON store", async () => {
    const filePath = await tempStorePath();
    const store = createLocalStore(filePath);

    const teachers = await store.listTeachers();

    expect(teachers).toEqual([
      expect.objectContaining({
        id: "local-admin",
        email: "admin@local.test",
        status: "admin"
      })
    ]);
    const raw = JSON.parse(await readFile(filePath, "utf8"));
    expect(raw.version).toBe(1);
    expect(raw.chatbots).toEqual([]);
    expect(raw.usageEvents).toEqual([]);
    expect(raw.aiSettings).toMatchObject({
      activeModelId: "lmstudio:gemma-4-12b-it",
      updatedBy: "system"
    });
  });

  it("persists admin AI model settings", async () => {
    const filePath = await tempStorePath();
    const store = createLocalStore(filePath);
    const current = await store.getAiSettings();
    const next = updateAiSettingsModel(current, {
      modelId: "lmstudio:gemma-4-12b-it",
      adminId: "local-admin",
      now: "2026-06-13T10:00:00.000Z"
    });

    await store.saveAiSettings(next);

    const reopened = createLocalStore(filePath);
    expect(await reopened.getAiSettings()).toEqual(next);
  });

  it("persists teachers and chatbots across store instances", async () => {
    const filePath = await tempStorePath();
    const store = createLocalStore(filePath);
    const approvedTeacher = approveTeacher(teacher(), {
      adminId: "local-admin",
      now: "2026-06-11T11:00:00.000Z",
      logId: "log-1"
    }).teacher;
    const sharedChatbot = enableShareLink(chatbot(), {
      actorTeacherId: "teacher-1",
      token: "abc123xyz789abc123xyz789",
      expiresAt: "2026-06-18"
    });

    await store.saveTeacher(approvedTeacher);
    await store.saveChatbot(sharedChatbot);

    const reopened = createLocalStore(filePath);
    expect(await reopened.getTeacher("teacher-1")).toMatchObject({
      id: "teacher-1",
      email: "teacher@example.com",
      status: "approved"
    });
    expect(await reopened.getChatbot("chatbot-1")).toMatchObject({
      id: "chatbot-1",
      ownerTeacherId: "teacher-1",
      name: "전기 회로 탐구"
    });
    expect(await reopened.findChatbotByShareToken("abc123xyz789abc123xyz789")).toMatchObject({
      id: "chatbot-1",
      share: {
        enabled: true,
        publicToken: "abc123xyz789abc123xyz789",
        expiresAt: "2026-06-18"
      }
    });
    expect(await reopened.findChatbotByShareToken("missing-token")).toBeUndefined();
  });

  it("serializes concurrent writes so teacher records are not lost", async () => {
    const filePath = await tempStorePath();
    const store = createLocalStore(filePath);
    const teachers = Array.from({ length: 12 }, (_, index) =>
      registerLocalTeacher(
        {
          realName: `교사 ${index}`,
          email: `teacher-${index}@example.com`,
          passwordHash: `hash-${index}`,
          school: selectedSchool
        },
        { id: `teacher-${index}`, now: `2026-06-11T10:${String(index).padStart(2, "0")}:00.000Z` }
      )
    );

    await Promise.all(teachers.map((item) => store.saveTeacher(item)));

    const saved = await store.listTeachers();
    expect(saved.map((item) => item.id).sort()).toEqual(["local-admin", ...teachers.map((item) => item.id)].sort());
  });

  it("shares the same write queue for equivalent relative and absolute store paths", async () => {
    const filePath = await tempStorePath();
    const absoluteStore = createLocalStore(filePath);
    const relativeStore = createLocalStore(relative(process.cwd(), filePath));
    const teachers = Array.from({ length: 12 }, (_, index) =>
      registerLocalTeacher(
        {
          realName: `경로 교사 ${index}`,
          email: `path-teacher-${index}@example.com`,
          passwordHash: `path-hash-${index}`,
          school: selectedSchool
        },
        { id: `path-teacher-${index}`, now: `2026-06-11T11:${String(index).padStart(2, "0")}:00.000Z` }
      )
    );

    await Promise.all(
      teachers.map((item, index) => (index % 2 === 0 ? absoluteStore.saveTeacher(item) : relativeStore.saveTeacher(item)))
    );

    const saved = await absoluteStore.listTeachers();
    expect(saved.map((item) => item.id).sort()).toEqual(["local-admin", ...teachers.map((item) => item.id)].sort());
  });

  it("appends usage events without overwriting earlier events", async () => {
    const filePath = await tempStorePath();
    const store = createLocalStore(filePath);
    const first = createUsageEvent({
      id: "usage-1",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      conversationId: "conversation-1",
      occurredAt: "2026-06-12T10:00:00.000Z",
      surface: "student_share",
      inputText: "학생 질문 원문",
      outputText: "교사 챗봇 응답 원문"
    });
    const second = createUsageEvent({
      id: "usage-2",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      conversationId: "conversation-2",
      occurredAt: "2026-06-12T10:05:00.000Z",
      surface: "teacher_preview",
      inputText: "미리보기 질문",
      outputText: "미리보기 응답"
    });

    await store.appendUsageEvent(first);
    await store.appendUsageEvent(second);

    expect(await store.listUsageEvents()).toEqual([first, second]);
  });

  it("preserves usage provider, model, token, and cost fields", async () => {
    const filePath = await tempStorePath();
    const store = createLocalStore(filePath);
    const usage = createUsageEvent({
      id: "usage-openai",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      conversationId: "conversation-1",
      occurredAt: "2026-06-12T10:00:00.000Z",
      surface: "student_share",
      inputText: "원문은 저장하지 않는다",
      outputText: "응답 원문도 저장하지 않는다",
      modelId: "openai:gpt-5.4-nano",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000
    });

    await store.appendUsageEvent(usage);

    expect(await store.listUsageEvents()).toEqual([usage]);
  });

  it("appends admin and provider logs while removing raw student conversation fields", async () => {
    const filePath = await tempStorePath();
    const store = createLocalStore(filePath);

    await store.appendAdminActionLog({
      id: "log-1",
      type: "admin_action_logged",
      action: "teacher_disabled",
      adminId: "local-admin",
      targetTeacherId: "teacher-1",
      createdAt: "2026-06-12T10:00:00.000Z",
      reason: "policy_violation",
      studentConversation: "학생 대화 원문",
      rawStudentMessage: "학생 질문 원문"
    });
    await store.appendProviderErrorLog({
      id: "provider-error-1",
      occurredAt: "2026-06-12T10:01:00.000Z",
      provider: "lmstudio",
      status: 502,
      code: "BAD_GATEWAY",
      message: "Local provider failed",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      studentConversation: "학생 대화 원문",
      rawStudentMessage: "학생 질문 원문"
    });

    const adminLogs = await store.listAdminActionLogs();
    const providerLogs = await store.listProviderErrorLogs();
    expect(adminLogs).toEqual([
      {
        id: "log-1",
        type: "admin_action_logged",
        action: "teacher_disabled",
        adminId: "local-admin",
        targetTeacherId: "teacher-1",
        createdAt: "2026-06-12T10:00:00.000Z",
        reason: "policy_violation"
      }
    ]);
    expect(providerLogs).toEqual([
      {
        id: "provider-error-1",
        occurredAt: "2026-06-12T10:01:00.000Z",
        provider: "lmstudio",
        status: 502,
        code: "BAD_GATEWAY",
        message: "Local provider failed",
        teacherId: "teacher-1",
        chatbotId: "chatbot-1"
      }
    ]);

    const serialized = JSON.stringify({ adminLogs, providerLogs });
    expect(serialized).not.toContain("학생 대화 원문");
    expect(serialized).not.toContain("학생 질문 원문");
    expect(serialized).not.toContain("studentConversation");
    expect(serialized).not.toContain("rawStudentMessage");
  });

  it("normalizes existing JSON logs before returning them", async () => {
    const filePath = await tempStorePath();
    await writeFile(
      filePath,
      JSON.stringify(
        {
          version: 1,
          teachers: [],
          chatbots: [],
          usageEvents: [
            {
              id: "usage-raw",
              kind: "ai_call",
              teacherId: "teacher-1",
              chatbotId: "chatbot-1",
              conversationId: "conversation-1",
              occurredAt: "2026-06-12T10:00:00.000Z",
              month: "2026-06",
              surface: "student_share",
              inputTextLength: 7,
              outputTextLength: 8,
              inputTokenEstimate: 2,
              outputTokenEstimate: 2,
              riskCodes: ["email"],
              rawStudentMessage: "child@example.com"
            }
          ],
          adminActionLogs: [
            {
              id: "admin-raw",
              type: "admin_action_logged",
              action: "teacher_disabled",
              adminId: "local-admin",
              targetTeacherId: "teacher-1",
              createdAt: "2026-06-12T10:00:00.000Z",
              reason: "policy_violation",
              studentConversation: "학생 대화 원문"
            }
          ],
          providerErrorLogs: [
            {
              id: "provider-raw",
              occurredAt: "2026-06-12T10:01:00.000Z",
              provider: "lmstudio",
              message: "Local provider failed",
              rawStudentMessage: "child@example.com"
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const store = createLocalStore(filePath);
    const returned = {
      usageEvents: await store.listUsageEvents(),
      adminActionLogs: await store.listAdminActionLogs(),
      providerErrorLogs: await store.listProviderErrorLogs()
    };

    const serialized = JSON.stringify(returned);
    expect(serialized).toContain("usage-raw");
    expect(serialized).toContain("admin-raw");
    expect(serialized).toContain("provider-raw");
    expect(serialized).not.toContain("child@example.com");
    expect(serialized).not.toContain("학생 대화 원문");
    expect(serialized).not.toContain("rawStudentMessage");
    expect(serialized).not.toContain("studentConversation");
  });
});
