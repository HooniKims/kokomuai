import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { storePortContractVersion, type StorePort } from "../../server/storePort";
import { createLocalStore } from "../../server/localStore";
import { updateAiSettingsModel } from "../../src/domain/ai/aiSettings";
import { createChatbot, enableShareLink } from "../../src/domain/chatbot/chatbotManagement";
import { approveTeacher, registerLocalTeacher } from "../../src/domain/identity/identityAccess";
import { createUsageEvent } from "../../src/domain/usage/usageAccounting";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempStorePath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "store-port-"));
  tempRoots.push(root);
  return join(root, "store.json");
}

describe("StorePort compatibility", () => {
  it("lets the local store satisfy the production storage boundary", async () => {
    expect(storePortContractVersion).toBe(2);
    const store: StorePort = createLocalStore(await tempStorePath());
    const teacher = approveTeacher(
      registerLocalTeacher(
        {
          realName: "김하늘",
          email: "teacher@example.com",
          passwordHash: "argon2id$hashed-password",
          school: {
            schoolName: "새빛중학교",
            schoolKind: "중학교",
            officeCode: "B10",
            standardSchoolCode: "1234567",
            region: "서울"
          }
        },
        { id: "teacher-1", now: "2026-06-13T00:00:00.000Z" }
      ),
      { adminId: "local-admin", now: "2026-06-13T00:01:00.000Z", logId: "admin-log-1" }
    ).teacher;
    const chatbot = enableShareLink(
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
        { id: "chatbot-1", now: "2026-06-13T00:02:00.000Z" }
      ),
      { actorTeacherId: teacher.id, token: "share-token-1234567890", expiresAt: null }
    );
    const usage = createUsageEvent({
      id: "usage-1",
      teacherId: teacher.id,
      chatbotId: chatbot.id,
      conversationId: "conversation-1",
      occurredAt: "2026-06-13T00:03:00.000Z",
      surface: "student_share",
      inputText: "관형사와 부사의 차이가 궁금해",
      outputText: "두 단어가 꾸미는 대상이 어떻게 다른지 문장에서 찾아볼까요?",
      modelId: "openai:gpt-5.4-nano",
      inputTokens: 100,
      outputTokens: 120
    });

    await store.saveTeacher(teacher);
    await store.saveChatbot(chatbot);
    await store.appendUsageEvent(usage);
    await store.saveAiSettings(
      updateAiSettingsModel(await store.getAiSettings(), {
        modelId: "lmstudio:gemma-4-12b-it",
        adminId: "local-admin",
        now: "2026-06-13T00:04:00.000Z"
      })
    );
    await store.appendAdminActionLog({
      id: "admin-log-2",
      type: "admin_action_logged",
      action: "teacher_approved",
      adminId: "local-admin",
      targetTeacherId: teacher.id,
      createdAt: "2026-06-13T00:05:00.000Z"
    });
    await store.appendProviderErrorLog({
      id: "provider-error-1",
      occurredAt: "2026-06-13T00:06:00.000Z",
      provider: "openai",
      message: "rate limited",
      status: 429,
      teacherId: teacher.id,
      chatbotId: chatbot.id,
      surface: "student_share"
    });

    expect(await store.getTeacher(teacher.id)).toMatchObject({ id: teacher.id, status: "approved" });
    expect(await store.listTeachers()).toContainEqual(expect.objectContaining({ id: teacher.id }));
    expect(await store.getChatbot(chatbot.id)).toMatchObject({ id: chatbot.id, ownerTeacherId: teacher.id });
    expect(await store.listChatbotsByOwner(teacher.id)).toContainEqual(expect.objectContaining({ id: chatbot.id }));
    expect(await store.findChatbotByShareToken("share-token-1234567890")).toMatchObject({ id: chatbot.id });
    expect(await store.listUsageEvents()).toEqual([usage]);
    expect(await store.listUsageSummariesByTeacher(teacher.id)).toEqual([expect.objectContaining({ teacherId: teacher.id })]);
    expect(await store.getAiSettings()).toMatchObject({ activeModelId: "lmstudio:gemma-4-12b-it" });
    expect(await store.listAdminActionLogs()).toContainEqual(expect.objectContaining({ id: "admin-log-2" }));
    expect(await store.listProviderErrorLogs()).toContainEqual(expect.objectContaining({ id: "provider-error-1" }));
  });
});
