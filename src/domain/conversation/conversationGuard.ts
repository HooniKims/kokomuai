import type { ChatbotPolicyInput } from "../chatbot/types";
import { detectPrivacyRisks } from "../privacy/privacyFilter";

export type ConversationGuardKind =
  | "normal"
  | "answer_request"
  | "out_of_scope"
  | "prompt_injection"
  | "unsafe"
  | "privacy_risk";

export interface ConversationGuardDecision {
  kind: ConversationGuardKind;
  blockAiCall: boolean;
  riskCodes: string[];
}

const promptInjectionPatterns = [
  /이전\s*지시/i,
  /지시를\s*무시/i,
  /시스템\s*프롬프트/i,
  /내부\s*규칙/i,
  /developer\s*message/i,
  /system\s*prompt/i
];

const answerRequestPatterns = [
  /정답만/i,
  /답만/i,
  /숙제\s*답/i,
  /빨리\s*답/i,
  /그냥\s*답/i,
  /풀이\s*전체/i
];

const unsafePatterns = [
  /죽고\s*싶/i,
  /자해/i,
  /살기\s*싫/i,
  /때리고\s*싶/i,
  /죽이고\s*싶/i,
  /학대/i,
  /위험해/i
];

const subjectKeywords: Record<string, string[]> = {
  과학: ["전기", "회로", "전구", "전지", "전선", "전류", "자기", "실험", "관찰"],
  수학: ["수", "식", "방정식", "함수", "도형", "계산", "분수", "비례"],
  국어: [
    "글",
    "문장",
    "읽기",
    "쓰기",
    "시",
    "소설",
    "토론",
    "문법",
    "품사",
    "단어",
    "예문",
    "명사",
    "대명사",
    "수사",
    "동사",
    "형용사",
    "관형사",
    "부사",
    "조사",
    "감탄사"
  ],
  사회: ["사회", "역사", "지도", "지역", "문화", "정치", "경제"],
  영어: ["영어", "단어", "문장", "읽기", "쓰기", "말하기"]
};

const clearlyDifferentTopicTerms = [
  "조선",
  "고려",
  "신라",
  "백제",
  "세종대왕",
  "왕",
  "임금",
  "업적",
  "전쟁",
  "지도",
  "지역",
  "문화",
  "정치",
  "경제",
  "방정식",
  "함수",
  "도형",
  "분수",
  "영어",
  "번역"
];

export function classifyStudentMessage(message: string, chatbot: ChatbotPolicyInput): ConversationGuardDecision {
  const normalized = normalize(message);
  const privacy = detectPrivacyRisks(message);

  if (privacy.blocked) {
    return {
      kind: "privacy_risk",
      blockAiCall: true,
      riskCodes: privacy.risks.map((risk) => risk.type)
    };
  }

  if (matchesAny(normalized, unsafePatterns)) {
    return {
      kind: "unsafe",
      blockAiCall: true,
      riskCodes: ["unsafe"]
    };
  }

  if (matchesAny(normalized, promptInjectionPatterns)) {
    return {
      kind: "prompt_injection",
      blockAiCall: true,
      riskCodes: ["prompt_injection"]
    };
  }

  if (matchesAny(normalized, answerRequestPatterns)) {
    return {
      kind: "answer_request",
      blockAiCall: false,
      riskCodes: ["answer_request"]
    };
  }

  if (isOutOfScope(normalized, chatbot)) {
    return {
      kind: "out_of_scope",
      blockAiCall: true,
      riskCodes: ["out_of_scope"]
    };
  }

  return {
    kind: "normal",
    blockAiCall: false,
    riskCodes: []
  };
}

export function shouldCallAiProvider(decision: ConversationGuardDecision): boolean {
  return !decision.blockAiCall;
}

export function createGuardrailReply(decision: ConversationGuardDecision, chatbot: ChatbotPolicyInput): string {
  switch (decision.kind) {
    case "privacy_risk":
      return "개인정보로 보이는 내용이 있어요. 이름, 학번, 전화번호, 주소 같은 정보는 빼고 다시 적어 주세요.";
    case "unsafe":
      return "지금 위험하거나 많이 힘든 상황이라면 혼자 견디지 말고 가까운 선생님, 보호자, 믿을 수 있는 어른에게 바로 알려 주세요. 바로 위험하면 112 또는 119에 도움을 요청해 주세요.";
    case "prompt_injection":
      return `그 요청은 따를 수 없어요. 지금은 ${chatbot.topic}에 대해 함께 생각해 볼게요. 이 주제에서 궁금한 점을 다시 적어 주세요.`;
    case "out_of_scope":
      return `이 챗봇은 ${chatbot.subject} 수업의 ${chatbot.topic} 범위 안에서만 도와줄 수 있어요. 이 주제와 관련된 질문으로 다시 적어 주세요.`;
    case "answer_request":
      return "답만 바로 말하기보다는 같이 하나씩 찾아보면 좋겠어요. 먼저 어떤 부분이 헷갈렸나요?";
    case "normal":
      return "";
  }
}

function isOutOfScope(message: string, chatbot: ChatbotPolicyInput): boolean {
  const topicTerms = tokenize(`${chatbot.subject} ${chatbot.topic} ${chatbot.learningGoal}`);
  const supportTerms = subjectKeywords[chatbot.subject] ?? [];
  const allowedTerms = new Set([...topicTerms, ...supportTerms.map(normalize)].filter((term) => term.length >= 2));

  if (allowedTerms.size === 0) return false;

  const messageTerms = tokenize(message);
  const hasAllowedTerm = messageTerms.some((term) => allowedTerms.has(term) || Array.from(allowedTerms).some((allowed) => term.includes(allowed) || allowed.includes(term)));

  const hasClearlyDifferentTopic = messageTerms.some((term) =>
    clearlyDifferentTopicTerms.some((blocked) => term === blocked || term.includes(blocked) || blocked.includes(term))
  );
  return !hasAllowedTerm && hasClearlyDifferentTopic;
}

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();
}

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      normalize(text)
        .split(/[^0-9a-z가-힣]+/i)
        .map((term) => term.trim())
        .flatMap((term) => [term, stripKoreanParticle(term)])
        .filter((term) => term.length >= 2)
    )
  );
}

function stripKoreanParticle(term: string): string {
  const particles = [
    "으로부터",
    "로부터",
    "에게서",
    "한테서",
    "에서는",
    "에게",
    "한테",
    "에서",
    "으로",
    "라고",
    "처럼",
    "까지",
    "부터",
    "보다",
    "만큼",
    "이나",
    "나",
    "은",
    "는",
    "이",
    "가",
    "을",
    "를",
    "의",
    "에",
    "와",
    "과",
    "도",
    "만",
    "로"
  ];

  const particle = particles.find((candidate) => term.endsWith(candidate) && term.length > candidate.length + 1);
  return particle ? term.slice(0, -particle.length) : term;
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}
