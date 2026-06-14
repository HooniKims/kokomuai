import type { ChatbotPolicyInput } from "../domain/chatbot/types.js";

export const teacherChatbotSample: ChatbotPolicyInput & { name: string } = {
  name: "국어 9품사 이해",
  schoolLevel: "middle",
  gradeBand: "1",
  subject: "국어",
  topic: "중학교 국어 품사의 종류와 특성",
  learningGoal: "학생이 명사, 대명사, 수사, 동사, 형용사, 관형사, 부사, 조사, 감탄사의 역할을 예문 속에서 구분하도록 돕는다.",
  hintStrength: "medium",
  persona: "친절하지만 답을 바로 말하지 않고 예문과 질문으로 이끄는 선생님"
};
