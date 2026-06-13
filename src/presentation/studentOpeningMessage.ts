import type { ChatbotPolicyInput } from "../domain/chatbot/types.js";

export function createStudentOpeningMessage(chatbot: ChatbotPolicyInput): string {
  return `안녕하세요. ${chatbot.topic}에서 먼저 어떤 부분이 궁금한가요? 예를 들어 헷갈리는 단어나 문장을 하나 적어 주면 함께 살펴볼게요.`;
}
