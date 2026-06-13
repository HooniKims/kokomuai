import { describe, expect, it } from "vitest";
import { resolveNextChatbotSelection, toggleAllChatbotSelection, toggleChatbotSelection } from "../../src/presentation/chatbotListSelection";
import type { ManagedChatbot } from "../../src/domain/chatbot/chatbotManagement";

const chatbots = [chatbot("chatbot-1"), chatbot("chatbot-2"), chatbot("chatbot-3")];

describe("chatbotListSelection", () => {
  it("toggles one chatbot in and out of the selected list", () => {
    expect(toggleChatbotSelection(["chatbot-1"], "chatbot-2")).toEqual(["chatbot-1", "chatbot-2"]);
    expect(toggleChatbotSelection(["chatbot-1", "chatbot-2"], "chatbot-1")).toEqual(["chatbot-2"]);
  });

  it("selects all visible chatbots and clears them when every item is already selected", () => {
    expect(toggleAllChatbotSelection([], chatbots)).toEqual(["chatbot-1", "chatbot-2", "chatbot-3"]);
    expect(toggleAllChatbotSelection(["chatbot-1", "chatbot-2", "chatbot-3"], chatbots)).toEqual([]);
  });

  it("removes deleted chatbot ids from the current selection", () => {
    expect(resolveNextChatbotSelection(["chatbot-1", "chatbot-2", "chatbot-3"], ["chatbot-2", "chatbot-3"])).toEqual(["chatbot-1"]);
  });
});

function chatbot(id: string): ManagedChatbot {
  return {
    id,
    ownerTeacherId: "teacher-1",
    name: id,
    schoolLevel: "middle",
    gradeBand: "1",
    subject: "국어",
    topic: "중1 국어 9품사에 대한 이해",
    learningGoal: "품사의 역할을 구분한다.",
    hintStrength: "medium",
    persona: "국어 선생님",
    curriculumLinks: [],
    lifecycle: { status: "active" },
    share: {
      enabled: false,
      publicToken: "",
      expiresAt: null
    },
    createdAt: "2026-06-12T10:00:00.000Z",
    updatedAt: "2026-06-12T10:00:00.000Z"
  };
}
