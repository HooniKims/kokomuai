import { describe, expect, it, vi } from "vitest";
import { applyDeletedChatbotToList, confirmSelectedChatbotDeletion } from "../../src/presentation/App";
import { getChatbotDeletionPrompt } from "../../src/presentation/chatbotDeletionPrompt";
import type { ManagedChatbot } from "../../src/domain/chatbot/chatbotManagement";

describe("chatbot deletion UI helpers", () => {
  it("formats the inline confirmation message near a chatbot delete button", () => {
    expect(getChatbotDeletionPrompt("중1 국어 9품사 이해")).toBe("중1 국어 9품사 이해 챗봇과 공유 링크를 삭제할까요?");
  });

  it("asks once before deleting selected chatbots", () => {
    const confirm = vi.fn(() => true);

    expect(confirmSelectedChatbotDeletion(3, confirm)).toBe(true);
    expect(confirm).toHaveBeenCalledWith("선택한 챗봇 3개와 공유 링크를 삭제할까요? 삭제하면 교사 목록에서 사라집니다.");
  });

  it("removes a deleted chatbot from the teacher list immediately", () => {
    const activeChatbot = chatbot("chatbot-1", "active");
    const deletedChatbot = chatbot("chatbot-1", "deleted");
    const otherChatbot = chatbot("chatbot-2", "active");

    expect(applyDeletedChatbotToList([activeChatbot, otherChatbot], deletedChatbot)).toEqual([otherChatbot]);
  });
});

function chatbot(id: string, status: ManagedChatbot["lifecycle"]["status"]): ManagedChatbot {
  return {
    id,
    ownerTeacherId: "teacher-1",
    name: `chatbot ${id}`,
    schoolLevel: "elementary",
    gradeBand: "5-6",
    subject: "science",
    topic: "topic",
    learningGoal: "goal",
    hintStrength: "medium",
    persona: "persona",
    curriculumLinks: [],
    lifecycle: { status },
    share: {
      enabled: status !== "deleted",
      publicToken: status === "deleted" ? "" : "public-token-123456",
      expiresAt: null
    },
    createdAt: "2026-06-12T10:00:00.000Z",
    updatedAt: "2026-06-12T10:00:00.000Z"
  };
}
