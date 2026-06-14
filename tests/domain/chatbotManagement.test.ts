import { describe, expect, it } from "vitest";
import {
  assertCanManageChatbot,
  createChatbot,
  deleteChatbot,
  disableChatbotByAdmin,
  disableShareLink,
  enableShareLink,
  isShareLinkAccessible,
  isValidShareExpirationDate,
  updateChatbot,
  validateChatbotDraft
} from "../../src/domain/chatbot/chatbotManagement";

const chatbotInput = {
  ownerTeacherId: "teacher-1",
  name: "전기 회로 탐구",
  schoolLevel: "elementary" as const,
  gradeBand: "5-6",
  subject: "과학",
  topic: "전기 회로에서 전구가 켜지는 조건",
  learningGoal: "학생이 전구가 켜지는 조건을 스스로 설명하도록 돕는다.",
  hintStrength: "medium" as const,
  persona: "친절하지만 답을 바로 말하지 않는 과학 선생님"
};

describe("chatbotManagement", () => {
  it("creates a private chatbot by default", () => {
    const chatbot = createChatbot(chatbotInput, {
      id: "chatbot-1",
      now: "2026-06-11T10:00:00.000Z"
    });

    expect(chatbot.share.enabled).toBe(false);
    expect(chatbot.share.publicToken).toBe("");
    expect(chatbot.curriculumLinks).toEqual([]);
  });

  it("enables a share link with an opaque token and optional expiration", () => {
    const chatbot = createChatbot(chatbotInput, {
      id: "chatbot-1",
      now: "2026-06-11T10:00:00.000Z"
    });

    const shared = enableShareLink(chatbot, {
      token: "abc123xyz789abc123xyz789",
      expiresAt: "2026-06-18",
      actorTeacherId: "teacher-1"
    });

    expect(shared.share.enabled).toBe(true);
    expect(shared.share.publicToken).toBe("abc123xyz789abc123xyz789");
    expect(shared.share.expiresAt).toBe("2026-06-18");
  });

  it("validates direct date input as strict YYYY-MM-DD", () => {
    expect(isValidShareExpirationDate("2026-06-18")).toBe(true);
    expect(isValidShareExpirationDate("2026-6-18")).toBe(false);
    expect(isValidShareExpirationDate("2026-02-30")).toBe(false);
  });

  it("rejects incomplete drafts and overly broad topics before creation", () => {
    expect(() =>
      validateChatbotDraft({
        ...chatbotInput,
        name: " ",
        topic: "과학"
      })
    ).toThrow("챗봇 이름");

    expect(() =>
      validateChatbotDraft({
        ...chatbotInput,
        topic: "과학"
      })
    ).toThrow("수업 주제");
  });

  it("accepts concise curriculum concepts as specific chatbot topics", () => {
    expect(() =>
      validateChatbotDraft({
        ...chatbotInput,
        name: "수학 일차함수 챗봇",
        schoolLevel: "middle",
        gradeBand: "1",
        subject: "수학",
        topic: "1차 함수",
        learningGoal: "1차 함수의 뜻과 식을 이해한다.",
        persona: "질문으로 돕는 수학 선생님"
      })
    ).not.toThrow();
  });

  it("updates chatbot authoring fields while preserving identity and owner", () => {
    const chatbot = createChatbot(chatbotInput, {
      id: "chatbot-1",
      now: "2026-06-11T10:00:00.000Z"
    });

    const updated = updateChatbot(
      chatbot,
      {
        name: "닫힌 전기 회로 탐구",
        topic: "닫힌 전기 회로에서 전류가 흐르는 조건",
        hintStrength: "high"
      },
      { actorTeacherId: "teacher-1", now: "2026-06-12T10:00:00.000Z" }
    );

    expect(updated.id).toBe("chatbot-1");
    expect(updated.ownerTeacherId).toBe("teacher-1");
    expect(updated.name).toBe("닫힌 전기 회로 탐구");
    expect(updated.topic).toBe("닫힌 전기 회로에서 전류가 흐르는 조건");
    expect(updated.hintStrength).toBe("high");
    expect(updated.updatedAt).toBe("2026-06-12T10:00:00.000Z");
    expect(updated.createdAt).toBe(chatbot.createdAt);
  });

  it("blocks non-owners from managing a chatbot", () => {
    const chatbot = createChatbot(chatbotInput, {
      id: "chatbot-1",
      now: "2026-06-11T10:00:00.000Z"
    });

    expect(() => assertCanManageChatbot(chatbot, "teacher-2")).toThrow("권한");
    expect(() =>
      updateChatbot(chatbot, { name: "다른 교사의 수정" }, { actorTeacherId: "teacher-2", now: "2026-06-12T10:00:00.000Z" })
    ).toThrow("권한");
    expect(() =>
      enableShareLink(chatbot, {
        token: "abc123xyz789abc123xyz789",
        actorTeacherId: "teacher-2"
      })
    ).toThrow("권한");
    expect(() =>
      disableShareLink(
        { ...chatbot, share: { enabled: true, publicToken: "abc123xyz789abc123xyz789", expiresAt: null } },
        { actorTeacherId: "teacher-2", now: "2026-06-12T10:00:00.000Z" }
      )
    ).toThrow("권한");
    expect(() =>
      deleteChatbot(chatbot, { actorTeacherId: "teacher-2", now: "2026-06-12T10:00:00.000Z" })
    ).toThrow("권한");
  });

  it("disables share links and blocks expired shared access", () => {
    const chatbot = createChatbot(chatbotInput, {
      id: "chatbot-1",
      now: "2026-06-11T10:00:00.000Z"
    });
    const shared = enableShareLink(chatbot, {
      token: "abc123xyz789abc123xyz789",
      expiresAt: "2026-06-18",
      actorTeacherId: "teacher-1"
    });

    expect(isShareLinkAccessible(shared, "2026-06-18T10:00:00.000Z")).toBe(true);
    expect(isShareLinkAccessible(shared, "2026-06-19T00:00:00.000Z")).toBe(false);

    const disabled = disableShareLink(shared, {
      actorTeacherId: "teacher-1",
      now: "2026-06-12T10:00:00.000Z"
    });

    expect(disabled.share.enabled).toBe(false);
    expect(disabled.share.publicToken).toBe("");
    expect(isShareLinkAccessible(disabled, "2026-06-12T10:00:00.000Z")).toBe(false);
  });

  it("marks a chatbot deleted instead of losing audit metadata", () => {
    const chatbot = createChatbot(chatbotInput, {
      id: "chatbot-1",
      now: "2026-06-11T10:00:00.000Z"
    });

    const deleted = deleteChatbot(chatbot, {
      actorTeacherId: "teacher-1",
      now: "2026-06-12T10:00:00.000Z"
    });

    expect(deleted.lifecycle.status).toBe("deleted");
    expect(deleted.lifecycle.deletedAt).toBe("2026-06-12T10:00:00.000Z");
    expect(deleted.lifecycle.disabledAt).toBeUndefined();
    expect(deleted.updatedAt).toBe("2026-06-12T10:00:00.000Z");
  });

  it("lets an admin disable a problematic chatbot while keeping owner audit metadata", () => {
    const chatbot = enableShareLink(
      createChatbot(chatbotInput, {
        id: "chatbot-1",
        now: "2026-06-11T10:00:00.000Z"
      }),
      {
        actorTeacherId: "teacher-1",
        token: "abc123xyz789abc123xyz789"
      }
    );

    const result = disableChatbotByAdmin(chatbot, {
      adminId: "local-admin",
      now: "2026-06-12T10:00:00.000Z",
      logId: "admin-log-1"
    });

    expect(result.chatbot.lifecycle.status).toBe("disabled");
    expect(result.chatbot.lifecycle.disabledAt).toBe("2026-06-12T10:00:00.000Z");
    expect(result.chatbot.share.enabled).toBe(false);
    expect(result.chatbot.share.publicToken).toBe("");
    expect(isShareLinkAccessible(result.chatbot, "2026-06-12T10:00:00.000Z")).toBe(false);
    expect(result.event).toMatchObject({
      action: "chatbot_disabled",
      adminId: "local-admin",
      targetTeacherId: "teacher-1",
      targetChatbotId: "chatbot-1"
    });
  });
});
