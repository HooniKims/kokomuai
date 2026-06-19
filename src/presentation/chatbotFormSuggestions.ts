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

interface TopicSuggestionInput {
  name: string;
  schoolLevel: SchoolLevel;
  gradeBand: string;
  subject: string;
}

type ChatbotFormAutoDraftInput = LearningGoalSuggestionInput &
  PersonaSuggestionInput &
  TopicSuggestionInput & {
    hintStrength: string;
    learningGoal: string;
    persona: string;
    questionLevel: string;
  };

const questionTutorPersona = "정답을 먼저 설명하지 않고 학생의 생각을 확인하는 질문형 튜터";

export function buildTopicSuggestions(
  input: TopicSuggestionInput,
  _recommendations: CurriculumRecommendationView[],
): ChatbotFormSuggestion[] {
  const nameTopic = buildNameBasedTopicSuggestion(input);
  return nameTopic ? [nameTopic] : [];
}

export function applyChatbotFormAutoDraft<T extends ChatbotFormAutoDraftInput>(
  current: T,
  next: T,
): T {
  const currentDraft = buildChatbotFormAutoDraft(current);
  const nextDraft = buildChatbotFormAutoDraft(next);

  return {
    ...next,
    topic: shouldReplaceWithAutoDraft(current.topic, currentDraft.topic)
      ? nextDraft.topic
      : next.topic,
    learningGoal: shouldReplaceWithAutoDraft(current.learningGoal, currentDraft.learningGoal)
      ? nextDraft.learningGoal
      : next.learningGoal,
    persona: shouldReplaceWithAutoDraft(current.persona, currentDraft.persona)
      ? nextDraft.persona
      : next.persona,
  };
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
      value: questionTutorPersona,
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

function buildChatbotFormAutoDraft(input: ChatbotFormAutoDraftInput): Pick<ChatbotFormAutoDraftInput, "topic" | "learningGoal" | "persona"> {
  const topic = buildNameBasedTopic(input);
  const goalTopic = normalizeText(input.topic) || topic;

  return {
    topic,
    learningGoal: goalTopic
      ? `${goalTopic}의 핵심 개념을 학생이 자기 말로 설명하도록 돕는다.`
      : "",
    persona: questionTutorPersona,
  };
}

function buildNameBasedTopicSuggestion(input: TopicSuggestionInput): ChatbotFormSuggestion | null {
  const topic = buildNameBasedTopic(input);
  if (!topic) return null;

  return {
    id: "topic-chatbot-name",
    label: "챗봇명 기반",
    value: topic,
  };
}

function buildNameBasedTopic(input: Pick<TopicSuggestionInput, "name" | "subject">): string {
  const coreKeyword = extractChatbotNameKeyword(input.name, input.subject);
  if (!coreKeyword) return "";

  const subject = normalizeText(input.subject);
  return [subject, `${coreKeyword} 이해`].filter(Boolean).join(" ");
}

function extractChatbotNameKeyword(name: string, subject: string): string {
  const subjectTokens = new Set(tokenizeKeywordText(subject));
  const tokens = tokenizeKeywordText(name)
    .filter((token) => !subjectTokens.has(token))
    .filter((token) => !chatbotNameNoiseWords.has(token));

  return tokens.slice(0, 4).join(" ");
}

function tokenizeKeywordText(value: string): string[] {
  return normalizeText(value)
    .replace(/[()[\]{}<>〈〉《》「」『』]/g, " ")
    .split(/[\s:：,，.。·ㆍ|/\\_-]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function shouldReplaceWithAutoDraft(currentValue: string, currentAutoValue: string): boolean {
  const trimmed = currentValue.trim();
  return trimmed === "" || trimmed === currentAutoValue;
}

const chatbotNameNoiseWords = new Set([
  "ai",
  "AI",
  "챗봇",
  "봇",
  "튜터",
  "선생님",
  "도우미",
  "코치",
  "조교",
  "길잡이",
  "학습",
  "수업",
  "이해",
  "설명",
  "연습",
  "문제",
  "퀴즈",
  "질문",
  "핵심",
  "개념",
]);

function summarizeAchievement(achievement: string): string {
  return achievement.replace(/\s+/g, " ").trim().replace(/[.。]$/, "");
}
