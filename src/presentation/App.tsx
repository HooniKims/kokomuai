import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearLocalConversation,
  loadLocalConversation,
  saveLocalConversation,
} from "../infrastructure/storage/localConversationStore.js";
import {
  streamStudentChat,
  type UiChatMessage,
} from "../infrastructure/ai/streamingChatClient.js";
import type { ChatbotPolicyInput } from "../domain/chatbot/types.js";
import type { ManagedChatbot } from "../domain/chatbot/chatbotManagement.js";
import type { IdentityTeacherAccount } from "../domain/identity/identityAccess.js";
import {
  recommendCurriculum,
  type CurriculumChunk,
} from "../domain/curriculum/curriculumRecommendation.js";
import {
  createFirebaseAuthTokenProvider,
  getKkokkomuFirebaseAuth,
  isFirebaseClientConfigured,
  isFirebaseTeacherAuthEnabled,
  listenToTeacherAuth,
  signInTeacherWithEmail,
  signInTeacherWithGoogle,
  signOutTeacher,
  signUpTeacherWithEmail,
} from "../infrastructure/firebase/client.js";
import * as api from "./apiClient.js";
import { TeacherAuthPanel } from "./auth/TeacherAuthPanel.js";
import { buildTeacherRegistrationPayload } from "./auth/teacherAuthForm.js";
import { AdminDashboardRoute } from "./routes/AdminDashboardRoute.js";
import { PrivacyPolicyRoute } from "./routes/PrivacyPolicyRoute.js";
import { StudentChatRoute } from "./routes/StudentChatRoute.js";
import { TeacherDashboardRoute } from "./routes/TeacherDashboardRoute.js";
import { footerCopyrightText } from "./legal/privacyPolicy.js";
import { formatSchoolLevelLabel } from "./schoolLevelLabel.js";
import { teacherChatbotSample } from "./teacherChatbotSample.js";
import { resolveCurriculumRecommendationState } from "./curriculumRecommendationState.js";
import {
  resolveSelectedCurriculumRecommendations,
  toCurriculumLink,
  toggleCurriculumSelection,
} from "./curriculumSelection.js";
import {
  resolveNextChatbotSelection,
  toggleAllChatbotSelection,
  toggleChatbotSelection,
} from "./chatbotListSelection.js";
import { shouldPersistConversation } from "./conversationPersistence.js";
import { getHeroDescription } from "./heroDescription.js";
import { summarizeUsageTotals } from "./usage/usageDisplay.js";

const demoChatbot: ChatbotPolicyInput = teacherChatbotSample;

const curriculumChunks: CurriculumChunk[] = [
  {
    id: "korean-parts-of-speech",
    sourceTitle: "2022 개정 국어과 교육과정 [별책5]",
    schoolLevel: "middle",
    gradeBand: "1-3",
    subject: "국어",
    area: "문법",
    achievement:
      "[9국04-03] 품사의 종류와 특성을 이해하고 국어 자료를 분석한다.",
    excerpt:
      "품사의 종류와 특성을 이해하고 실제 언어 자료에서 단어의 쓰임을 분석한다.",
  },
  {
    id: "science-life-cycle",
    sourceTitle: "2022 개정 과학과 교육과정 [별책9]",
    schoolLevel: "elementary",
    gradeBand: "3-4",
    subject: "과학",
    area: "생물의 생활",
    achievement: "[4과03-01] 식물의 한살이를 관찰하고 변화 과정을 설명한다.",
    excerpt: "씨가 싹트고 자라 꽃과 열매를 맺는 과정을 관찰한다.",
  },
  {
    id: "math-linear-equation",
    sourceTitle: "2022 개정 수학과 교육과정 [별책8]",
    schoolLevel: "middle",
    gradeBand: "1",
    subject: "수학",
    area: "문자와 식",
    achievement: "[9수02-05] 일차방정식을 이해하고 상황에 맞게 활용한다.",
    excerpt: "등식의 성질을 이용하여 일차방정식을 해결한다.",
  },
];

type AppView = "student" | "teacher" | "admin";

const selectedSchool = {
  schoolName: "새빛중학교",
  schoolKind: "중학교",
  officeCode: "B10",
  standardSchoolCode: "1234567",
  region: "서울",
};

const fallbackChatbot: ManagedChatbot = {
  ...demoChatbot,
  id: "fallback-chatbot",
  ownerTeacherId: "local-admin",
  name: teacherChatbotSample.name,
  curriculumLinks: [
    {
      chunkId: "korean-parts-of-speech",
      sourceTitle: "2022 개정 국어과 교육과정 [별책5]",
      subject: "국어",
      area: "문법",
      achievement:
        "[9국04-03] 품사의 종류와 특성을 이해하고 국어 자료를 분석한다.",
    },
  ],
  lifecycle: {
    status: "active",
  },
  share: {
    enabled: false,
    publicToken: "",
    expiresAt: null,
  },
  createdAt: "2026-06-11T09:10:00.000Z",
  updatedAt: "2026-06-11T09:10:00.000Z",
};

function makeTxt(
  messages: UiChatMessage[],
  chatbot: ChatbotPolicyInput & { name?: string },
) {
  const title = chatbot.name?.trim() || chatbot.topic;
  const lines = [
    `${title} 챗봇`,
    "",
    "이 기록은 학습 과정 확인용이며, 정답지나 평가 결과가 아닙니다.",
    `수업 주제: ${chatbot.topic}`,
    `학교급/과목: ${formatSchoolLevelLabel(chatbot.schoolLevel)} ${chatbot.gradeBand} · ${chatbot.subject}`,
    `대화 날짜: ${new Date().toLocaleString("ko-KR")}`,
    "",
    "대화 기록",
    "---------",
    ...messages.map(
      (message) =>
        `${message.role === "user" ? "학생" : "챗봇"}: ${message.content}`,
    ),
  ];
  return lines.join("\n");
}

function downloadBlob(filename: string, type: string, content: string | Blob) {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function tokenFromPath(): string {
  const match = /^\/s\/([^/?#]+)/.exec(window.location.pathname);
  return match ? decodeURIComponent(match[1]) : "";
}

export function shouldShowRoleNavigation(pathname: string): boolean {
  return !/^\/s\/[^/?#]+/.test(pathname);
}

export function shouldUseFirebaseTeacherAuth(
  pathname: string,
  firebaseConfigured: boolean,
  authEnabled: boolean,
): boolean {
  return (
    authEnabled && firebaseConfigured && shouldShowRoleNavigation(pathname)
  );
}

export function resolveInitialView(pathname: string): AppView {
  return shouldShowRoleNavigation(pathname) ? "teacher" : "student";
}

export function confirmSelectedChatbotDeletion(
  count: number,
  confirmDeletion: (message: string) => boolean = window.confirm,
): boolean {
  return confirmDeletion(
    `선택한 챗봇 ${count}개와 공유 링크를 삭제할까요? 삭제하면 교사 목록에서 사라집니다.`,
  );
}

export function applyDeletedChatbotToList(
  current: ManagedChatbot[],
  deleted: ManagedChatbot,
): ManagedChatbot[] {
  if (deleted.lifecycle.status !== "deleted") {
    return current.map((chatbot) =>
      chatbot.id === deleted.id ? deleted : chatbot,
    );
  }

  return current.filter((chatbot) => chatbot.id !== deleted.id);
}

export function isFirebaseEmailAlreadyInUse(error: unknown): boolean {
  return hasFirebaseAuthCode(error, "auth/email-already-in-use");
}

export function toFriendlyFirebaseAuthError(
  error: unknown,
  fallbackMessage: string,
): string {
  if (hasFirebaseAuthCode(error, "auth/invalid-credential")) {
    return "이메일 또는 비밀번호가 맞지 않습니다. 다시 확인해 주세요.";
  }

  if (hasFirebaseAuthCode(error, "auth/user-not-found")) {
    return "가입된 이메일을 찾지 못했습니다. 이메일 가입을 먼저 진행해 주세요.";
  }

  if (hasFirebaseAuthCode(error, "auth/wrong-password")) {
    return "비밀번호가 맞지 않습니다. 다시 확인해 주세요.";
  }

  if (hasFirebaseAuthCode(error, "auth/weak-password")) {
    return "비밀번호는 8자 이상으로 입력해 주세요.";
  }

  return error instanceof Error && error.message
    ? error.message
    : fallbackMessage;
}

function hasFirebaseAuthCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === code ||
    (typeof candidate.message === "string" &&
      candidate.message.includes(code))
  );
}

export function App() {
  const isPrivacyPage = window.location.pathname === "/privacy";
  const [usesFirebaseTeacherAuth] = useState(() =>
    shouldUseFirebaseTeacherAuth(
      window.location.pathname,
      isFirebaseClientConfigured(),
      isFirebaseTeacherAuthEnabled(),
    ),
  );
  const [view, setView] = useState<AppView>(() =>
    resolveInitialView(window.location.pathname),
  );
  const [messages, setMessages] = useState<UiChatMessage[]>([]);
  const [hasLoadedConversation, setHasLoadedConversation] = useState(false);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const [teachers, setTeachers] = useState<IdentityTeacherAccount[]>([]);
  const [chatbots, setChatbots] = useState<ManagedChatbot[]>([]);
  const [selectedChatbotIds, setSelectedChatbotIds] = useState<string[]>([]);
  const [activeTeacherId, setActiveTeacherId] = useState("");
  const [adminReviewTeacherId, setAdminReviewTeacherId] = useState("");
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [resetLog, setResetLog] = useState("");
  const [rejectionReason, setRejectionReason] = useState("학교 정보 확인 필요");
  const [adminActionLogs, setAdminActionLogs] = useState<
    Awaited<ReturnType<typeof api.getAdminActionLogs>>
  >([]);
  const [workspaceStatus, setWorkspaceStatus] = useState(
    "로컬 서버 상태를 확인하고 있습니다.",
  );
  const [shareNotice, setShareNotice] = useState("");
  const [shareNoticeChatbotId, setShareNoticeChatbotId] = useState("");
  const [pendingDeleteChatbotId, setPendingDeleteChatbotId] = useState("");
  const [pendingSelectedDelete, setPendingSelectedDelete] = useState(false);
  const [usageSummaries, setUsageSummaries] = useState<
    Awaited<ReturnType<typeof api.getUsageSummaries>>
  >([]);
  const [aiSettings, setAiSettings] = useState<api.AiSettingsPayload | null>(
    null,
  );
  const [studentChatbot, setStudentChatbot] = useState<ManagedChatbot | null>(
    null,
  );
  const [authRealName, setAuthRealName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPasswordConfirmation, setAuthPasswordConfirmation] =
    useState("");
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authSchoolQuery, setAuthSchoolQuery] = useState("");
  const [authSchoolResults, setAuthSchoolResults] = useState<
    api.SchoolSearchResult[]
  >([]);
  const [authSelectedSchool, setAuthSelectedSchool] =
    useState<api.SchoolSearchResult | null>(null);
  const [authError, setAuthError] = useState("");
  const [isSearchingSchools, setIsSearchingSchools] = useState(false);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [selectedCurriculumChunkIds, setSelectedCurriculumChunkIds] = useState<
    string[]
  >([]);
  const [
    showAllCurriculumRecommendations,
    setShowAllCurriculumRecommendations,
  ] = useState(false);
  const [chatbotForm, setChatbotForm] = useState({
    name: "",
    schoolLevel: demoChatbot.schoolLevel,
    topic: "",
    learningGoal: "",
    subject: "",
    gradeBand: "",
    persona: "",
    hintStrength: demoChatbot.hintStrength,
  });
  const abortRef = useRef<AbortController | null>(null);
  const activeChatbot =
    studentChatbot ??
    chatbots.find((chatbot) => chatbot.lifecycle.status === "active") ??
    fallbackChatbot;
  const recommendationState = useMemo(
    () =>
      resolveCurriculumRecommendationState(chatbotForm, teacherChatbotSample),
    [
      chatbotForm.name,
      chatbotForm.schoolLevel,
      chatbotForm.subject,
      chatbotForm.topic,
      chatbotForm.learningGoal,
      chatbotForm.gradeBand,
      chatbotForm.persona,
      chatbotForm.hintStrength,
    ],
  );
  const fallbackCurriculumRecommendations = useMemo(
    () =>
      recommendCurriculum({
        topic: recommendationState.query,
        schoolLevel: recommendationState.schoolLevel,
        gradeBand: recommendationState.gradeBand,
        chunks: curriculumChunks,
      }).filter(
        (item) =>
          !recommendationState.subject ||
          item.chunk.subject === recommendationState.subject,
      ),
    [recommendationState],
  );
  const [curriculumRecommendations, setCurriculumRecommendations] = useState<
    api.CurriculumRecommendationView[]
  >(fallbackCurriculumRecommendations);
  const selectedCurriculumRecommendations =
    resolveSelectedCurriculumRecommendations(
      curriculumRecommendations,
      selectedCurriculumChunkIds,
    );
  const activeTeacherUsageTotals = summarizeUsageTotals(
    activeTeacherId
      ? usageSummaries.filter(
          (summary) => summary.teacherId === activeTeacherId,
        )
      : usageSummaries,
  );

  useEffect(() => {
    setMessages(loadLocalConversation());
    setHasLoadedConversation(true);
  }, []);

  useEffect(() => {
    if (!shouldPersistConversation(hasLoadedConversation)) return;
    saveLocalConversation(messages);
  }, [hasLoadedConversation, messages]);

  useEffect(() => {
    if (!shareNotice) return;

    const timeout = window.setTimeout(() => {
      setShareNotice("");
      setShareNoticeChatbotId("");
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [shareNotice]);

  useEffect(() => {
    if (!usesFirebaseTeacherAuth) {
      void initializeWorkspace();
      return;
    }

    const auth = getKkokkomuFirebaseAuth();
    api.setApiAuthTokenProvider(createFirebaseAuthTokenProvider(auth));
    const unsubscribe = listenToTeacherAuth(auth, (user) => {
      void handleFirebaseAuthUser(user);
    });

    return () => {
      unsubscribe();
      api.setApiAuthTokenProvider(null);
    };
  }, [usesFirebaseTeacherAuth]);

  useEffect(() => {
    if (!usesFirebaseTeacherAuth) return;

    const query = authSchoolQuery.trim();
    if (query.length < 2) {
      setAuthSchoolResults([]);
      setIsSearchingSchools(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setIsSearchingSchools(true);
      setAuthError("");
      void api
        .searchSchools(query)
        .then((schools) => {
          if (cancelled) return;
          setAuthSchoolResults(schools);
          if (schools.length === 0) {
            setAuthError(
              "검색 결과가 없습니다. 학교명을 조금 더 정확히 입력해 주세요.",
            );
          }
        })
        .catch((caught) => {
          if (cancelled) return;
          setAuthError(
            caught instanceof Error
              ? caught.message
              : "학교 검색 중 문제가 생겼습니다.",
          );
        })
        .finally(() => {
          if (!cancelled) setIsSearchingSchools(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [authSchoolQuery, usesFirebaseTeacherAuth]);

  useEffect(() => {
    setCurriculumRecommendations(fallbackCurriculumRecommendations);
    const timeout = window.setTimeout(() => {
      void api
        .getCurriculumRecommendations(recommendationState.query, {
          schoolLevel: recommendationState.schoolLevel,
          gradeBand: recommendationState.gradeBand,
          subject: recommendationState.subject,
        })
        .then((recommendations) => {
          if (recommendations.length > 0)
            setCurriculumRecommendations(recommendations);
        })
        .catch(() => {
          setCurriculumRecommendations(fallbackCurriculumRecommendations);
        });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [recommendationState, fallbackCurriculumRecommendations]);

  async function initializeWorkspace() {
    const shareToken = tokenFromPath();
    try {
      if (shareToken) {
        const shared = await api.getSharedChatbot(shareToken);
        setStudentChatbot(shared);
        setView("student");
        setWorkspaceStatus("공유 챗봇을 불러왔습니다.");
        return;
      }

      const teacher = await ensureApprovedLocalTeacher();
      await refreshWorkspace(teacher.id);
      setWorkspaceStatus("로컬 서버와 연결됐습니다.");
    } catch (caught) {
      setWorkspaceStatus(
        caught instanceof Error
          ? caught.message
          : "로컬 서버와 연결하지 못했습니다.",
      );
    }
  }

  async function handleFirebaseAuthUser(
    user: { email: string | null; displayName: string | null } | null,
  ) {
    setAuthError("");

    if (!user) {
      setActiveTeacherId("");
      setChatbots([]);
      setTeachers([]);
      setUsageSummaries([]);
      setWorkspaceStatus("교사 계정으로 로그인하거나 가입해 주세요.");
      return;
    }

    const email = user.email ?? "";
    if (email) setAuthEmail(email);
    if (user.displayName)
      setAuthRealName((current) => current || user.displayName || "");

    try {
      const nextTeachers = await api.listTeachers();
      setTeachers(nextTeachers);
      const ownProfile =
        nextTeachers.find((teacher) => teacher.email === email) ??
        nextTeachers[0];
      if (!ownProfile) {
        setWorkspaceStatus("학교를 선택한 뒤 가입 요청을 보내 주세요.");
        return;
      }

      if (ownProfile.status === "approved" || ownProfile.status === "admin") {
        await refreshWorkspace(ownProfile.id);
        setWorkspaceStatus(
          ownProfile.status === "admin"
            ? "관리자 계정으로 연결됐습니다."
            : "교사 계정으로 연결됐습니다.",
        );
      } else {
        setActiveTeacherId("");
        setChatbots([]);
        setUsageSummaries([]);
        setWorkspaceStatus(
          "가입 요청이 접수됐습니다. 관리자 승인 후 사용할 수 있습니다.",
        );
      }
    } catch (caught) {
      setActiveTeacherId("");
      setChatbots([]);
      setUsageSummaries([]);
      setWorkspaceStatus(
        caught instanceof Error &&
          caught.message !== "teacher_profile_not_found"
          ? caught.message
          : "학교를 선택한 뒤 가입 요청을 보내 주세요.",
      );
    }
  }

  async function ensureApprovedLocalTeacher(): Promise<IdentityTeacherAccount> {
    const currentTeachers = await api.listTeachers();
    const existing = currentTeachers.find(
      (teacher) =>
        teacher.status === "approved" && teacher.id !== "local-admin",
    );
    if (existing) return existing;

    const registered = await api.registerTeacher({
      realName: "로컬 교사",
      email: "local-teacher@local.test",
      passwordHash: "local-dev-teacher-password-hash",
      school: selectedSchool,
    });
    return api.approveTeacher(registered.id, "local-admin");
  }

  async function refreshWorkspace(teacherId = activeTeacherId) {
    const [nextTeachers, nextUsageSummaries] = await Promise.all([
      api.listTeachers(),
      api.getUsageSummaries(),
    ]);
    const profile = nextTeachers.find((teacher) => teacher.id === teacherId);
    const nextChatbots = teacherId
      ? await api.listChatbots(
          profile?.status === "admin" ? undefined : teacherId,
        )
      : [];
    setTeachers(nextTeachers);
    setChatbots(nextChatbots);
    setUsageSummaries(nextUsageSummaries);
    setActiveTeacherId(teacherId);
    setSelectedTeacherIds(
      nextTeachers
        .filter((teacher) => teacher.status === "pending")
        .map((teacher) => teacher.id),
    );
    void api
      .getAdminActionLogs()
      .then(setAdminActionLogs)
      .catch(() => setAdminActionLogs([]));
    void api
      .getAiSettings()
      .then(setAiSettings)
      .catch(() => setAiSettings(null));
  }

  async function signInWithTeacherEmail() {
    setIsSubmittingAuth(true);
    setAuthError("");
    try {
      await signInTeacherWithEmail(
        getKkokkomuFirebaseAuth(),
        authEmail.trim(),
        authPassword,
      );
    } catch (caught) {
      setAuthError(
        toFriendlyFirebaseAuthError(caught, "이메일 로그인에 실패했습니다."),
      );
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function signUpWithTeacherEmail() {
    if (authPassword !== authPasswordConfirmation) {
      setAuthError("비밀번호가 일치하지 않습니다. 다시 확인해 주세요.");
      return;
    }

    setIsSubmittingAuth(true);
    setAuthError("");
    try {
      await signUpTeacherWithEmail(
        getKkokkomuFirebaseAuth(),
        authEmail.trim(),
        authPassword,
      );
      setWorkspaceStatus(
        "Firebase 계정이 생성됐습니다. 학교를 선택하고 가입 요청을 보내 주세요.",
      );
    } catch (caught) {
      if (isFirebaseEmailAlreadyInUse(caught)) {
        try {
          await signInTeacherWithEmail(
            getKkokkomuFirebaseAuth(),
            authEmail.trim(),
            authPassword,
          );
          setWorkspaceStatus(
            "이미 가입된 이메일입니다. 로그인으로 이어졌습니다. 학교를 선택하고 가입 요청을 보내 주세요.",
          );
          return;
        } catch {
          setAuthError(
            "이미 가입된 이메일입니다. 기존 비밀번호로 로그인하거나 Google로 계속하기를 사용해 주세요.",
          );
          return;
        }
      }

      setAuthError(
        toFriendlyFirebaseAuthError(caught, "이메일 가입에 실패했습니다."),
      );
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function signInWithTeacherGoogle() {
    setIsSubmittingAuth(true);
    setAuthError("");
    try {
      await signInTeacherWithGoogle(getKkokkomuFirebaseAuth());
      setWorkspaceStatus(
        "Google 계정이 확인됐습니다. 학교를 선택하고 가입 요청을 보내 주세요.",
      );
    } catch (caught) {
      setAuthError(
        toFriendlyFirebaseAuthError(caught, "Google 로그인에 실패했습니다."),
      );
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function registerFirebaseTeacherProfile() {
    setIsSubmittingAuth(true);
    setAuthError("");
    try {
      const teacher = await api.registerTeacher(
        buildTeacherRegistrationPayload({
          realName: authRealName,
          email: authEmail,
          selectedSchool: authSelectedSchool,
        }),
      );
      setTeachers([teacher]);
      setWorkspaceStatus(
        teacher.status === "approved" || teacher.status === "admin"
          ? "교사 계정으로 연결됐습니다."
          : "가입 요청이 접수됐습니다. 관리자 승인 후 사용할 수 있습니다.",
      );
      if (teacher.status === "approved" || teacher.status === "admin") {
        await refreshWorkspace(teacher.id);
      }
    } catch (caught) {
      setAuthError(
        caught instanceof Error
          ? caught.message.replace(
              "요청을 처리하는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.",
              "가입 요청 처리 중 문제가 생겼습니다. 이미 요청이 접수됐는지 관리자 화면에서 확인해 주세요.",
            )
          : "가입 요청을 저장하지 못했습니다.",
      );
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function signOutCurrentTeacher() {
    setIsSubmittingAuth(true);
    setAuthError("");
    try {
      await signOutTeacher(getKkokkomuFirebaseAuth());
    } catch (caught) {
      setAuthError(
        caught instanceof Error ? caught.message : "로그아웃에 실패했습니다.",
      );
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const nextMessages: UiChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let assistant = "";
    setMessages([...nextMessages, { role: "assistant", content: "" }]);

    try {
      await streamStudentChat(
        { message: trimmed, history: messages, chatbot: activeChatbot },
        (token) => {
          assistant += token;
          setMessages([
            ...nextMessages,
            { role: "assistant", content: assistant },
          ]);
        },
        controller.signal,
      );
    } catch (caught) {
      if (!controller.signal.aborted) {
        setMessages(nextMessages);
        setError(
          caught instanceof Error
            ? caught.message
            : "응답을 불러오지 못했어요. 다시 시도해 주세요.",
        );
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
    setIsStreaming(false);
  }

  function resetConversation() {
    setMessages([]);
    setError("");
    clearLocalConversation();
  }

  function downloadTxt() {
    downloadBlob(
      "student-chat.txt",
      "text/plain;charset=utf-8",
      makeTxt(messages, activeChatbot),
    );
  }

  async function downloadPdf() {
    const { default: jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const text = makeTxt(messages, activeChatbot);
    const lines = pdf.splitTextToSize(text, 500);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(lines, 48, 48);
    pdf.save("student-chat.pdf");
  }

  async function approveSelectedTeachers() {
    setResetLog("");
    try {
      await Promise.all(
        selectedTeacherIds.map((teacherId) =>
          api.approveTeacher(teacherId, "local-admin"),
        ),
      );
      await refreshWorkspace();
      setResetLog("선택한 교사를 승인했습니다.");
    } catch (caught) {
      setResetLog(
        caught instanceof Error
          ? caught.message
          : "교사 승인 중 문제가 생겼습니다.",
      );
    }
  }

  async function rejectSelectedTeachers() {
    setResetLog("");
    const reason = rejectionReason.trim() || "학교 정보 확인 필요";
    try {
      await Promise.all(
        selectedTeacherIds.map((teacherId) =>
          api.rejectTeacherAsAdmin(teacherId, "local-admin", reason),
        ),
      );
      await refreshWorkspace();
      setResetLog("선택한 교사를 거절했습니다.");
    } catch (caught) {
      setResetLog(
        caught instanceof Error
          ? caught.message
          : "교사 거절 중 문제가 생겼습니다.",
      );
    }
  }

  async function createResetMailAction(teacher: IdentityTeacherAccount) {
    setResetLog("");
    try {
      const action = await api.sendTeacherPasswordResetEmail(
        teacher.id,
        "local-admin",
      );
      setResetLog(
        `${action.email} 주소로 비밀번호 재설정 메일을 발송했습니다.`,
      );
    } catch (caught) {
      setResetLog(
        caught instanceof Error
          ? caught.message
          : "비밀번호 재설정 메일을 발송하지 못했습니다.",
      );
    }
  }

  async function disableTeacherAsAdmin(teacher: IdentityTeacherAccount) {
    setResetLog("");
    try {
      const disabled = await api.disableTeacherAsAdmin(
        teacher.id,
        "local-admin",
      );
      setTeachers((current) =>
        current.map((item) => (item.id === disabled.id ? disabled : item)),
      );
      setResetLog(`${disabled.realName} 교사 계정을 사용 중지했습니다.`);
    } catch (caught) {
      setResetLog(
        caught instanceof Error
          ? caught.message
          : "교사 계정을 사용 중지하지 못했습니다.",
      );
    }
  }

  async function disableChatbotAsAdmin(chatbotId: string) {
    setResetLog("");
    try {
      const disabled = await api.disableChatbotAsAdmin(
        chatbotId,
        "local-admin",
      );
      setChatbots((current) =>
        current.map((chatbot) =>
          chatbot.id === disabled.id ? disabled : chatbot,
        ),
      );
      setResetLog("챗봇을 비활성화했습니다. 공유 링크 접근도 함께 차단됩니다.");
    } catch (caught) {
      setResetLog(
        caught instanceof Error
          ? caught.message
          : "챗봇을 비활성화하지 못했습니다.",
      );
    }
  }

  async function createLocalChatbot() {
    if (!activeTeacherId) {
      setWorkspaceStatus("교사 계정을 먼저 준비해야 합니다.");
      return;
    }

    const selectedCurriculumLinks =
      selectedCurriculumRecommendations.map(toCurriculumLink);
    try {
      const chatbot = await api.createChatbot({
        ownerTeacherId: activeTeacherId,
        name: chatbotForm.name.trim() || teacherChatbotSample.name,
        schoolLevel: chatbotForm.schoolLevel,
        gradeBand: resolveGradeBand(
          chatbotForm.schoolLevel,
          chatbotForm.gradeBand,
        ),
        subject: chatbotForm.subject.trim() || demoChatbot.subject,
        topic: chatbotForm.topic.trim() || demoChatbot.topic,
        learningGoal:
          chatbotForm.learningGoal.trim() || demoChatbot.learningGoal,
        hintStrength: chatbotForm.hintStrength,
        persona: chatbotForm.persona.trim() || demoChatbot.persona,
        curriculumLinks: selectedCurriculumLinks,
      });
      const shared = await api.enableShareLink(
        chatbot.id,
        activeTeacherId,
        null,
      );
      setChatbots((current) => [
        shared,
        ...current.filter((item) => item.id !== shared.id),
      ]);
      const shareUrl = `${window.location.origin}/s/${shared.share.publicToken}`;
      setShareNoticeChatbotId(shared.id);
      setShareNotice(`학생용 링크가 준비됐습니다: ${shareUrl}`);
      setWorkspaceStatus("챗봇을 생성하고 학생용 바로가기를 준비했습니다.");
    } catch (caught) {
      setWorkspaceStatus(
        caught instanceof Error
          ? caught.message
          : "챗봇 생성 중 문제가 생겼습니다.",
      );
    }
  }

  async function enableLocalShare(chatbotId: string) {
    if (!activeTeacherId) return;

    try {
      const shared = await api.enableShareLink(
        chatbotId,
        activeTeacherId,
        null,
      );
      setChatbots((current) =>
        current.map((chatbot) => (chatbot.id === shared.id ? shared : chatbot)),
      );
      const shareUrl = `${window.location.origin}/s/${shared.share.publicToken}`;
      setShareNoticeChatbotId(shared.id);
      setShareNotice(`공유 링크가 준비됐습니다: ${shareUrl}`);
      await copyTextIfAvailable(shareUrl);
    } catch (caught) {
      setShareNoticeChatbotId(chatbotId);
      setShareNotice(
        caught instanceof Error
          ? caught.message
          : "공유 링크를 만들지 못했습니다.",
      );
    }
  }

  function requestLocalChatbotDeletion(chatbotId: string) {
    setPendingDeleteChatbotId(chatbotId);
    setPendingSelectedDelete(false);
  }

  function cancelLocalChatbotDeletion() {
    setPendingDeleteChatbotId("");
    setPendingSelectedDelete(false);
  }

  async function deleteLocalChatbot(chatbotId: string) {
    if (!activeTeacherId) return;

    try {
      const deleted = await api.deleteChatbot(chatbotId, activeTeacherId);
      setChatbots((current) => applyDeletedChatbotToList(current, deleted));
      setSelectedChatbotIds((current) =>
        resolveNextChatbotSelection(current, [chatbotId]),
      );
      setPendingDeleteChatbotId("");
      setShareNoticeChatbotId(chatbotId);
      setShareNotice("챗봇을 삭제했습니다.");
    } catch (caught) {
      setShareNoticeChatbotId(chatbotId);
      setShareNotice(
        caught instanceof Error
          ? caught.message
          : "챗봇을 삭제하지 못했습니다.",
      );
    }
  }

  function requestSelectedLocalChatbotsDeletion() {
    if (selectedChatbotIds.length === 0) return;
    setPendingSelectedDelete(true);
    setPendingDeleteChatbotId("");
  }

  async function deleteSelectedLocalChatbots() {
    if (!activeTeacherId || selectedChatbotIds.length === 0) return;

    const idsToDelete = [...selectedChatbotIds];
    try {
      const deletedChatbots = await Promise.all(
        idsToDelete.map((chatbotId) =>
          api.deleteChatbot(chatbotId, activeTeacherId),
        ),
      );
      setChatbots((current) =>
        deletedChatbots.reduce(applyDeletedChatbotToList, current),
      );
      setSelectedChatbotIds((current) =>
        resolveNextChatbotSelection(current, idsToDelete),
      );
      setPendingSelectedDelete(false);
      setShareNoticeChatbotId("");
      setShareNotice(`선택한 챗봇 ${deletedChatbots.length}개를 삭제했습니다.`);
    } catch (caught) {
      setShareNoticeChatbotId("");
      setShareNotice(
        caught instanceof Error
          ? caught.message
          : "선택한 챗봇을 삭제하지 못했습니다.",
      );
    }
  }

  async function copyShareLink(chatbot: ManagedChatbot) {
    if (!chatbot.share.publicToken) return;
    const shareUrl = `${window.location.origin}/s/${chatbot.share.publicToken}`;
    await copyTextIfAvailable(shareUrl);
    setShareNoticeChatbotId(chatbot.id);
    setShareNotice(`공유 링크를 복사했습니다: ${shareUrl}`);
  }

  async function updateAiModel(modelId: string) {
    try {
      const updated = await api.updateAiSettings("local-admin", modelId);
      setAiSettings(updated);
      setResetLog("AI 모델 설정을 저장했습니다.");
    } catch (caught) {
      setResetLog(
        caught instanceof Error
          ? caught.message
          : "AI 모델 설정을 저장하지 못했습니다.",
      );
    }
  }

  const showRoleNavigation = shouldShowRoleNavigation(window.location.pathname);
  const shouldShowTeacherAuthPanel =
    usesFirebaseTeacherAuth && view !== "student" && !activeTeacherId;

  return (
    <main className="app-shell">
      <section className="hero-band">
        <nav className="top-nav">
          <div className="brand">꼬꼬무AI</div>
          {showRoleNavigation ? (
            <div className="nav-actions">
              <button
                className={`pill ghost ${view === "teacher" ? "active" : ""}`}
                onClick={() => setView("teacher")}
                type="button"
              >
                교사
              </button>
              <button
                className={`pill ghost ${view === "admin" ? "active" : ""}`}
                onClick={() => setView("admin")}
                type="button"
              >
                관리자
              </button>
            </div>
          ) : null}
        </nav>
        <div className="hero-copy">
          <h1>
            꼬리에 꼬리를 무는 <span className="highlight-word">AI</span>
          </h1>
          <p>{getHeroDescription(view)}</p>
        </div>
      </section>

      {isPrivacyPage ? <PrivacyPolicyRoute /> : null}

      {!isPrivacyPage && view === "student" ? (
        <StudentChatRoute
          chatbot={activeChatbot}
          messages={messages}
          isStreaming={isStreaming}
          error={error}
          input={input}
          setInput={setInput}
          sendMessage={sendMessage}
          stopStreaming={stopStreaming}
          resetConversation={resetConversation}
          downloadPdf={downloadPdf}
          downloadTxt={downloadTxt}
        />
      ) : null}

      {!isPrivacyPage && shouldShowTeacherAuthPanel ? (
        <TeacherAuthPanel
          realName={authRealName}
          email={authEmail}
          password={authPassword}
          passwordConfirmation={authPasswordConfirmation}
          showPassword={showAuthPassword}
          schoolQuery={authSchoolQuery}
          schoolResults={authSchoolResults}
          selectedSchool={authSelectedSchool}
          isSearchingSchools={isSearchingSchools}
          isSubmitting={isSubmittingAuth}
          authStatus={workspaceStatus}
          authError={authError}
          onRealNameChange={setAuthRealName}
          onEmailChange={setAuthEmail}
          onPasswordChange={setAuthPassword}
          onPasswordConfirmationChange={setAuthPasswordConfirmation}
          onTogglePasswordVisibility={() =>
            setShowAuthPassword((current) => !current)
          }
          onSchoolQueryChange={(value) => {
            setAuthSchoolQuery(value);
            setAuthSelectedSchool(null);
          }}
          onSelectSchool={setAuthSelectedSchool}
          onEmailSignIn={signInWithTeacherEmail}
          onEmailSignUp={signUpWithTeacherEmail}
          onGoogleSignIn={signInWithTeacherGoogle}
          onRegisterProfile={registerFirebaseTeacherProfile}
          onSignOut={signOutCurrentTeacher}
        />
      ) : null}

      {!isPrivacyPage && view === "teacher" && !shouldShowTeacherAuthPanel ? (
        <TeacherDashboardRoute
          workspaceStatus={workspaceStatus}
          chatbots={chatbots}
          usageConversationCount={activeTeacherUsageTotals.conversationCount}
          usageAiCallCount={activeTeacherUsageTotals.aiCallCount}
          usageInputTokenCount={activeTeacherUsageTotals.inputTokenEstimate}
          usageOutputTokenCount={activeTeacherUsageTotals.outputTokenEstimate}
          usageEstimatedCostKrw={activeTeacherUsageTotals.estimatedCostKrw}
          activeTeacherId={activeTeacherId}
          chatbotForm={chatbotForm}
          setChatbotForm={setChatbotForm}
          curriculumRecommendations={curriculumRecommendations}
          selectedCurriculumChunkIds={selectedCurriculumChunkIds}
          toggleCurriculumChunkSelection={(chunkId) =>
            setSelectedCurriculumChunkIds((current) =>
              toggleCurriculumSelection(current, chunkId),
            )
          }
          selectedChatbotIds={selectedChatbotIds}
          toggleChatbotSelection={(chatbotId) =>
            setSelectedChatbotIds((current) =>
              toggleChatbotSelection(current, chatbotId),
            )
          }
          toggleAllChatbotSelection={() =>
            setSelectedChatbotIds((current) =>
              toggleAllChatbotSelection(current, chatbots),
            )
          }
          showAllCurriculumRecommendations={showAllCurriculumRecommendations}
          setShowAllCurriculumRecommendations={
            setShowAllCurriculumRecommendations
          }
          createLocalChatbot={createLocalChatbot}
          enableLocalShare={enableLocalShare}
          requestLocalChatbotDeletion={requestLocalChatbotDeletion}
          cancelLocalChatbotDeletion={cancelLocalChatbotDeletion}
          deleteLocalChatbot={deleteLocalChatbot}
          pendingDeleteChatbotId={pendingDeleteChatbotId}
          requestSelectedLocalChatbotsDeletion={
            requestSelectedLocalChatbotsDeletion
          }
          deleteSelectedLocalChatbots={deleteSelectedLocalChatbots}
          pendingSelectedDelete={pendingSelectedDelete}
          copyShareLink={copyShareLink}
          shareNotice={shareNotice}
          shareNoticeChatbotId={shareNoticeChatbotId}
        />
      ) : null}

      {!isPrivacyPage && view === "admin" && !shouldShowTeacherAuthPanel ? (
        <AdminDashboardRoute
          teachers={teachers}
          selectedTeacherIds={selectedTeacherIds}
          setSelectedTeacherIds={setSelectedTeacherIds}
          approveSelectedTeachers={approveSelectedTeachers}
          rejectSelectedTeachers={rejectSelectedTeachers}
          rejectionReason={rejectionReason}
          setRejectionReason={setRejectionReason}
          createResetMailAction={createResetMailAction}
          disableTeacherAsAdmin={disableTeacherAsAdmin}
          resetLog={resetLog}
          aiSettings={aiSettings}
          updateAiModel={updateAiModel}
          usageSummaries={usageSummaries}
          chatbots={chatbots}
          disableChatbotAsAdmin={disableChatbotAsAdmin}
          adminActionLogs={adminActionLogs}
          selectedReviewTeacherId={adminReviewTeacherId}
          setSelectedReviewTeacherId={setAdminReviewTeacherId}
        />
      ) : null}
      <footer className="app-footer">
        <span>{footerCopyrightText}</span>
        <a href="/privacy">개인정보처리방침</a>
      </footer>
    </main>
  );
}

async function copyTextIfAvailable(text: string) {
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    // 브라우저 권한이 없는 로컬 검증 환경에서도 공유 링크 표시는 유지한다.
  }
}

function resolveGradeBand(
  schoolLevel: ChatbotPolicyInput["schoolLevel"],
  gradeBand: string,
): string {
  const trimmed = gradeBand.trim();
  if (trimmed) return trimmed;
  return schoolLevel === "vocational_high" ? "all" : demoChatbot.gradeBand;
}
