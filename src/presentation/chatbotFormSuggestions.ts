import type { SchoolLevel } from "../domain/chatbot/types.js";
import type { CurriculumRecommendationView } from "./apiClient.js";

export interface ChatbotFormSuggestion {
  id: string;
  label: string;
  value: string;
}

interface LearningGoalSuggestionInput {
  schoolLevel: SchoolLevel;
  gradeBand: string;
  subject: string;
  topic: string;
}

interface PersonaSuggestionInput {
  schoolLevel: SchoolLevel;
  subject: string;
}

export function buildLearningGoalSuggestions(
  input: LearningGoalSuggestionInput,
  recommendations: CurriculumRecommendationView[],
): ChatbotFormSuggestion[] {
  const topic = normalizeText(input.topic) || "수업 주제";
  const subject = normalizeText(input.subject) || "수업";
  const achievement = recommendations[0]?.chunk.achievement;

  return [
    {
      id: "explain-core-concept",
      label: "핵심 개념 설명",
      value: `${topic}의 핵심 개념을 학생이 자기 말로 설명하도록 돕는다.`,
    },
    {
      id: "check-misconception",
      label: "오개념 점검",
      value: `${subject} 수업에서 학생의 오개념을 질문으로 확인하고 바로잡는다.`,
    },
    {
      id: "achievement-evidence",
      label: "성취기준 근거",
      value: achievement
        ? `${summarizeAchievement(achievement)} 성취기준에 맞춰 학생이 근거를 들어 답하도록 돕는다.`
        : "성취기준에 맞춰 학생이 근거를 들어 답하도록 돕는다.",
    },
    {
      id: "step-by-step-thinking",
      label: "과정 말하기",
      value: `${topic}을 해결하는 과정을 학생이 단계별로 말하도록 돕는다.`,
    },
  ];
}

export function buildPersonaSuggestions(
  input: PersonaSuggestionInput,
): ChatbotFormSuggestion[] {
  const subject = normalizeText(input.subject) || "수업";
  const levelLabel = input.schoolLevel === "elementary" ? "초등학생 눈높이" : "학생 눈높이";

  return [
    {
      id: "kind-coach",
      label: "친절한 코치",
      value: "답을 바로 말하지 않고 학생이 스스로 생각하도록 짧은 질문을 이어가는 친절한 코치",
    },
    {
      id: "question-tutor",
      label: "질문형 튜터",
      value: "정답을 먼저 설명하지 않고 학생의 생각을 확인하는 질문형 튜터",
    },
    {
      id: "misconception-checker",
      label: "오개념 점검",
      value: "학생의 답에서 오개념을 찾아 부드럽게 되묻고 예시로 바로잡는 선생님",
    },
    {
      id: "level-friendly",
      label: input.schoolLevel === "elementary" ? "초등 눈높이" : "학생 눈높이",
      value: `${levelLabel}에서 쉬운 말과 짧은 예시로 설명하는 선생님`,
    },
    {
      id: "summary-tutor",
      label: "핵심 정리",
      value: `${subject} 핵심 내용을 마지막에 한 문장으로 정리해 주는 튜터`,
    },
  ];
}

function normalizeText(value: string): string {
  return value.trim();
}

function summarizeAchievement(achievement: string): string {
  return achievement.replace(/\s+/g, " ").trim().replace(/[.。]$/, "");
}
