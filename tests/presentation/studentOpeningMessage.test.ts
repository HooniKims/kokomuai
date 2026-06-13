import { describe, expect, it } from "vitest";
import { createStudentOpeningMessage } from "../../src/presentation/studentOpeningMessage";
import type { ChatbotPolicyInput } from "../../src/domain/chatbot/types";

describe("studentOpeningMessage", () => {
  it("starts the chat with a topic-specific question from the chatbot", () => {
    expect(createStudentOpeningMessage(chatbot)).toBe(
      "안녕하세요. 중1 국어 9품사에 대한 이해에서 먼저 어떤 부분이 궁금한가요? 예를 들어 헷갈리는 단어나 문장을 하나 적어 주면 함께 살펴볼게요."
    );
  });
});

const chatbot: ChatbotPolicyInput = {
  schoolLevel: "middle",
  gradeBand: "1",
  subject: "국어",
  topic: "중1 국어 9품사에 대한 이해",
  learningGoal: "품사의 역할을 예문 속에서 구분하도록 돕는다.",
  hintStrength: "medium",
  persona: "국어 선생님"
};
