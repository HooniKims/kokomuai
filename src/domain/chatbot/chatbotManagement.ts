import type { ChatbotPolicyInput } from "./types.js";
import type { AdminActionLogEvent } from "../identity/identityAccess.js";

export interface CurriculumLink {
  chunkId: string;
  sourceTitle: string;
  subject: string;
  area: string;
  achievement: string;
}

export interface ManagedChatbot extends ChatbotPolicyInput {
  id: string;
  ownerTeacherId: string;
  name: string;
  curriculumLinks: CurriculumLink[];
  lifecycle: {
    status: "active" | "disabled" | "deleted";
    disabledAt?: string;
    disabledBy?: string;
    deletedAt?: string;
  };
  share: {
    enabled: boolean;
    publicToken: string;
    expiresAt: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateChatbotInput extends ChatbotPolicyInput {
  ownerTeacherId: string;
  name: string;
  curriculumLinks?: CurriculumLink[];
}

export class ChatbotDraftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatbotDraftValidationError";
  }
}

const validSchoolLevels = new Set(["elementary", "middle", "high", "vocational_high"]);
const validHintStrengths = new Set(["low", "medium", "high"]);
const validQuestionLevels = new Set(["easy", "medium", "hard"]);

export function createChatbot(input: CreateChatbotInput, options: { id: string; now: string }): ManagedChatbot {
  validateChatbotDraft(input);

  return {
    ...input,
    id: options.id,
    name: input.name.trim(),
    curriculumLinks: input.curriculumLinks ?? [],
    lifecycle: {
      status: "active"
    },
    share: {
      enabled: false,
      publicToken: "",
      expiresAt: null
    },
    createdAt: options.now,
    updatedAt: options.now
  };
}

export function validateChatbotDraft(input: CreateChatbotInput): void {
  if (!input.name.trim()) {
    throw new ChatbotDraftValidationError("챗봇 이름을 입력해 주세요.");
  }

  if (!validSchoolLevels.has(input.schoolLevel)) {
    throw new ChatbotDraftValidationError("학교급 선택값을 확인해 주세요.");
  }

  if (!validHintStrengths.has(input.hintStrength)) {
    throw new ChatbotDraftValidationError("힌트 강도 선택값을 확인해 주세요.");
  }

  if (input.questionLevel !== undefined && !validQuestionLevels.has(input.questionLevel)) {
    throw new ChatbotDraftValidationError("질문 수준 선택값을 확인해 주세요.");
  }

  if (!input.ownerTeacherId.trim()) {
    throw new ChatbotDraftValidationError("교사 정보를 확인할 수 없습니다.");
  }

  if (!input.gradeBand.trim()) {
    throw new ChatbotDraftValidationError("학년군/학년을 입력해 주세요.");
  }

  if (!input.subject.trim()) {
    throw new ChatbotDraftValidationError("과목을 입력해 주세요.");
  }

  if (isOverlyBroadTopic(input.topic, input.subject)) {
    throw new ChatbotDraftValidationError("수업 주제를 단원이나 개념이 드러나도록 조금 더 구체적으로 입력해 주세요.");
  }

  if (!input.learningGoal.trim()) {
    throw new ChatbotDraftValidationError("대화 목표를 입력해 주세요.");
  }

  if (!input.persona.trim()) {
    throw new ChatbotDraftValidationError("챗봇 페르소나를 입력해 주세요.");
  }
}

export function updateChatbot(
  chatbot: ManagedChatbot,
  patch: Partial<Omit<CreateChatbotInput, "ownerTeacherId">>,
  options: { actorTeacherId: string; now: string }
): ManagedChatbot {
  assertCanManageChatbot(chatbot, options.actorTeacherId);

  const next: ManagedChatbot = {
    ...chatbot,
    ...patch,
    name: patch.name !== undefined ? patch.name.trim() : chatbot.name,
    curriculumLinks: patch.curriculumLinks ?? chatbot.curriculumLinks,
    updatedAt: options.now
  };

  validateChatbotDraft({
    ownerTeacherId: next.ownerTeacherId,
    name: next.name,
    schoolLevel: next.schoolLevel,
    gradeBand: next.gradeBand,
    subject: next.subject,
    topic: next.topic,
    learningGoal: next.learningGoal,
    hintStrength: next.hintStrength,
    questionLevel: next.questionLevel,
    persona: next.persona,
    curriculumLinks: next.curriculumLinks
  });

  return next;
}

export function deleteChatbot(
  chatbot: ManagedChatbot,
  options: { actorTeacherId: string; now: string }
): ManagedChatbot {
  assertCanManageChatbot(chatbot, options.actorTeacherId);

  return {
    ...chatbot,
    lifecycle: {
      status: "deleted",
      deletedAt: options.now
    },
    share: {
      enabled: false,
      publicToken: "",
      expiresAt: null
    },
    updatedAt: options.now
  };
}

export function disableChatbotByAdmin(
  chatbot: ManagedChatbot,
  options: { adminId: string; now: string; logId: string }
): { chatbot: ManagedChatbot; event: AdminActionLogEvent } {
  return {
    chatbot: {
      ...chatbot,
      lifecycle: {
        status: "disabled",
        disabledAt: options.now,
        disabledBy: options.adminId
      },
      share: {
        enabled: false,
        publicToken: "",
        expiresAt: null
      },
      updatedAt: options.now
    },
    event: {
      id: options.logId,
      type: "admin_action_logged",
      action: "chatbot_disabled",
      adminId: options.adminId,
      targetTeacherId: chatbot.ownerTeacherId,
      targetChatbotId: chatbot.id,
      createdAt: options.now
    }
  };
}

export function assertCanManageChatbot(chatbot: ManagedChatbot, actorTeacherId: string): void {
  if (chatbot.ownerTeacherId !== actorTeacherId) {
    throw new Error("이 챗봇을 관리할 권한이 없습니다.");
  }

  if (chatbot.lifecycle.status === "deleted") {
    throw new Error("삭제된 챗봇은 수정할 수 없습니다.");
  }
}

export function enableShareLink(
  chatbot: ManagedChatbot,
  input: { token: string; actorTeacherId: string; expiresAt?: string | null }
): ManagedChatbot {
  assertCanManageChatbot(chatbot, input.actorTeacherId);

  if (chatbot.lifecycle.status !== "active") {
    throw new Error("활성 상태의 챗봇만 공유할 수 있습니다.");
  }

  if (input.token.trim().length < 16) {
    throw new Error("공유 토큰은 추측하기 어렵게 생성해야 합니다.");
  }

  if (input.expiresAt && !isValidShareExpirationDate(input.expiresAt)) {
    throw new Error("Invalid share expiration date");
  }

  return {
    ...chatbot,
    share: {
      enabled: true,
      publicToken: input.token,
      expiresAt: input.expiresAt ?? null
    }
  };
}

export function disableShareLink(
  chatbot: ManagedChatbot,
  options: { actorTeacherId: string; now: string }
): ManagedChatbot {
  assertCanManageChatbot(chatbot, options.actorTeacherId);

  return {
    ...chatbot,
    share: {
      enabled: false,
      publicToken: "",
      expiresAt: null
    },
    updatedAt: options.now
  };
}

export function isShareLinkAccessible(chatbot: ManagedChatbot, now: string): boolean {
  if (chatbot.lifecycle.status !== "active") {
    return false;
  }

  if (!chatbot.share.enabled || !chatbot.share.publicToken) {
    return false;
  }

  if (!chatbot.share.expiresAt) {
    return true;
  }

  const expiresAt = new Date(`${chatbot.share.expiresAt}T00:00:00.000Z`);
  const exclusiveEnd = new Date(expiresAt.getTime() + 24 * 60 * 60 * 1000);

  return new Date(now).getTime() < exclusiveEnd.getTime();
}

export function isValidShareExpirationDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isOverlyBroadTopic(topic: string, subject: string): boolean {
  const normalized = topic.trim().replace(/\s+/g, " ");
  if (!normalized) return true;

  const broadTopics = new Set(["과학", "수학", "국어", "사회", "영어", "음악", "미술", "체육", "역사"]);
  if (broadTopics.has(normalized)) return true;
  if (normalized === subject.trim()) return true;

  return normalized.replace(/\s+/g, "").length < 2;
}
