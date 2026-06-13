import type { SchoolLevel } from "../chatbot/types";

interface OpeningMessageInput {
  schoolLevel: SchoolLevel;
  topic: string;
}

export function buildOpeningMessage({ schoolLevel, topic }: OpeningMessageInput): string {
  if (schoolLevel === "elementary") {
    return `오늘은 ${topic}에 대해 함께 알아볼 거예요. 궁금한 점을 적어 주세요. 바로 답을 찾기보다, 같이 생각해 보면서 알아가요.`;
  }

  if (schoolLevel === "middle") {
    return `오늘 주제는 ${topic}입니다. 궁금한 점을 질문해 주세요. 답을 바로 외우기보다, 단서를 따라가며 함께 생각해 봅시다.`;
  }

  if (schoolLevel === "vocational_high") {
    return `오늘은 ${topic}을 직무 상황과 연결해 생각해 봅니다. 궁금한 점을 입력하면, 개념과 절차를 스스로 정리할 수 있도록 질문과 단서로 도와드리겠습니다.`;
  }

  return `오늘은 ${topic}을 중심으로 생각해 봅니다. 궁금한 점을 입력하면, 개념을 스스로 정리할 수 있도록 질문과 단서로 도와드리겠습니다.`;
}

export function summarizeLongStudentInput(text: string): { shouldSummarize: boolean; summary: string } {
  const normalized = text.replace(/\s+/g, " ").trim();
  const shouldSummarize = normalized.length >= 80;

  if (!shouldSummarize) {
    return { shouldSummarize: false, summary: normalized };
  }

  const firstSentence = normalized.split(/[.!?。？！]/)[0] || normalized;
  const summary = firstSentence.length > 80 ? `${firstSentence.slice(0, 77)}...` : firstSentence;

  return {
    shouldSummarize: true,
    summary
  };
}
