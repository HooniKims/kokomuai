import { describe, expect, it, vi } from "vitest";
import type { IdentityTeacherAccount } from "../../src/domain/identity/identityAccess";
import type { MonthlyUsageSummary } from "../../src/domain/usage/usageAccounting";
import { AdminDashboardRoute } from "../../src/presentation/routes/AdminDashboardRoute";
import { TeacherDashboardRoute } from "../../src/presentation/routes/TeacherDashboardRoute";
import { formatKrwCost, formatTokenCount, summarizeUsageByTeacher, summarizeUsageTotals } from "../../src/presentation/usage/usageDisplay";

describe("usage dashboard display", () => {
  it("formats teacher token and cost totals", () => {
    const totals = summarizeUsageTotals([
      usageSummary({ teacherId: "teacher-1", inputTokenEstimate: 1200, outputTokenEstimate: 340, estimatedCostKrw: 3 })
    ]);

    expect(formatTokenCount(totals.totalTokenEstimate)).toBe("1,540");
    expect(totals.estimatedCostKrw).toBe(3);
  });

  it("formats sub-won GPT-5.4 nano costs without rounding up to one won", () => {
    expect(formatKrwCost(0.88)).toBe("약 0.88원");
    expect(formatKrwCost(1.15)).toBe("1.15원");
  });

  it("renders token and cost metrics on the teacher dashboard", () => {
    const tree = TeacherDashboardRoute({
      workspaceStatus: "교사 계정으로 연결됐습니다.",
      chatbots: [],
      usageConversationCount: 2,
      usageAiCallCount: 4,
      usageInputTokenCount: 1200,
      usageOutputTokenCount: 340,
      usageEstimatedCostKrw: 3,
      activeTeacherId: "teacher-1",
      chatbotForm: {
        name: "",
        schoolLevel: "middle",
        topic: "",
        learningGoal: "",
        subject: "",
        gradeBand: "",
        persona: "",
        hintStrength: "medium",
        questionLevel: "medium"
      },
      setChatbotForm: vi.fn(),
      curriculumRecommendations: [],
      selectedCurriculumChunkIds: [],
      toggleCurriculumChunkSelection: vi.fn(),
      selectedChatbotIds: [],
      toggleChatbotSelection: vi.fn(),
      toggleAllChatbotSelection: vi.fn(),
      showAllCurriculumRecommendations: false,
      setShowAllCurriculumRecommendations: vi.fn(),
      createLocalChatbot: vi.fn(),
      enableLocalShare: vi.fn(),
      requestLocalChatbotDeletion: vi.fn(),
      cancelLocalChatbotDeletion: vi.fn(),
      deleteLocalChatbot: vi.fn(),
      pendingDeleteChatbotId: "",
      requestSelectedLocalChatbotsDeletion: vi.fn(),
      deleteSelectedLocalChatbots: vi.fn(),
      pendingSelectedDelete: false,
      copyShareLink: vi.fn(),
      shareNotice: "",
      shareNoticeChatbotId: ""
    });

    const text = normalizeText(collectText(tree).join(" "));
    expect(text).toContain("입력 토큰 1,200");
    expect(text).toContain("출력 토큰 340");
    expect(text).toContain("예상 비용 3원");
  });

  it("shows a student chatbot shortcut for shared teacher chatbots", () => {
    const tree = TeacherDashboardRoute({
      workspaceStatus: "교사 계정으로 연결됐습니다.",
      chatbots: [
        {
          id: "chatbot-1",
          ownerTeacherId: "teacher-1",
          name: "중학교 국어 품사",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "국어",
          topic: "품사의 종류와 특성",
          learningGoal: "품사의 역할을 문장 속에서 구분한다.",
          hintStrength: "medium",
          persona: "답을 바로 주지 않고 질문으로 돕는 국어 선생님",
          curriculumLinks: [],
          lifecycle: { status: "active" },
          share: {
            enabled: true,
            publicToken: "public-token-123456",
            expiresAt: null
          },
          createdAt: "2026-06-13T01:00:00.000Z",
          updatedAt: "2026-06-13T01:00:00.000Z"
        }
      ],
      usageConversationCount: 0,
      usageAiCallCount: 0,
      usageInputTokenCount: 0,
      usageOutputTokenCount: 0,
      usageEstimatedCostKrw: 0,
      activeTeacherId: "teacher-1",
      chatbotForm: {
        name: "",
        schoolLevel: "middle",
        topic: "",
        learningGoal: "",
        subject: "",
        gradeBand: "",
        persona: "",
        hintStrength: "medium",
        questionLevel: "medium"
      },
      setChatbotForm: vi.fn(),
      curriculumRecommendations: [],
      selectedCurriculumChunkIds: [],
      toggleCurriculumChunkSelection: vi.fn(),
      selectedChatbotIds: [],
      toggleChatbotSelection: vi.fn(),
      toggleAllChatbotSelection: vi.fn(),
      showAllCurriculumRecommendations: false,
      setShowAllCurriculumRecommendations: vi.fn(),
      createLocalChatbot: vi.fn(),
      enableLocalShare: vi.fn(),
      requestLocalChatbotDeletion: vi.fn(),
      cancelLocalChatbotDeletion: vi.fn(),
      deleteLocalChatbot: vi.fn(),
      pendingDeleteChatbotId: "",
      requestSelectedLocalChatbotsDeletion: vi.fn(),
      deleteSelectedLocalChatbots: vi.fn(),
      pendingSelectedDelete: false,
      copyShareLink: vi.fn(),
      shareNotice: "",
      shareNoticeChatbotId: ""
    });

    const links = collectElements(tree, "a");
    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          props: expect.objectContaining({
            href: "/s/public-token-123456",
            "aria-label": "학생용 챗봇 바로가기: 중학교 국어 품사"
          })
        })
      ])
    );
  });

  it("places the create chatbot button below the recommendation cards", () => {
    const tree = TeacherDashboardRoute({
      workspaceStatus: "교사 계정으로 연결됐습니다.",
      chatbots: [],
      usageConversationCount: 0,
      usageAiCallCount: 0,
      usageInputTokenCount: 0,
      usageOutputTokenCount: 0,
      usageEstimatedCostKrw: 0,
      activeTeacherId: "teacher-1",
      chatbotForm: {
        name: "",
        schoolLevel: "middle",
        topic: "",
        learningGoal: "",
        subject: "",
        gradeBand: "",
        persona: "",
        hintStrength: "medium",
        questionLevel: "medium"
      },
      setChatbotForm: vi.fn(),
      curriculumRecommendations: [
        {
          chunkId: "korean-parts-of-speech",
          label: "추천",
          reason: "문법 영역에서 수업 주제와 연결되는 성취기준입니다.",
          score: 8,
          chunk: {
            id: "korean-parts-of-speech",
            sourceTitle: "국어 교육과정",
            schoolLevel: "middle",
            gradeBand: "1-3",
            subject: "국어",
            area: "문법",
            achievement: "[9국04-03] 품사의 종류와 특성을 이해하고 국어 자료를 분석한다.",
            excerpt: "품사의 종류와 특성을 이해한다."
          }
        }
      ],
      selectedCurriculumChunkIds: [],
      toggleCurriculumChunkSelection: vi.fn(),
      selectedChatbotIds: [],
      toggleChatbotSelection: vi.fn(),
      toggleAllChatbotSelection: vi.fn(),
      showAllCurriculumRecommendations: false,
      setShowAllCurriculumRecommendations: vi.fn(),
      createLocalChatbot: vi.fn(),
      enableLocalShare: vi.fn(),
      requestLocalChatbotDeletion: vi.fn(),
      cancelLocalChatbotDeletion: vi.fn(),
      deleteLocalChatbot: vi.fn(),
      pendingDeleteChatbotId: "",
      requestSelectedLocalChatbotsDeletion: vi.fn(),
      deleteSelectedLocalChatbots: vi.fn(),
      pendingSelectedDelete: false,
      copyShareLink: vi.fn(),
      shareNotice: "",
      shareNoticeChatbotId: ""
    });

    const blocks = collectClassBlocks(tree);
    expect(blocks.indexOf("recommendation-strip")).toBeGreaterThan(-1);
    expect(blocks.indexOf("create-chatbot-footer")).toBeGreaterThan(blocks.indexOf("recommendation-strip"));
    expect(blocks.indexOf("create-chatbot-footer")).toBeLessThan(blocks.indexOf("chatbot-list-toolbar"));
  });

  it("groups admin usage by teacher without exposing conversation text", () => {
    const rows = summarizeUsageByTeacher(
      [teacher("teacher-1", "김하늘"), teacher("teacher-2", "이바다")],
      [
        usageSummary({ teacherId: "teacher-1", inputTokenEstimate: 25, outputTokenEstimate: 50, estimatedCostKrw: 1 }),
        usageSummary({ teacherId: "teacher-2", inputTokenEstimate: 100, outputTokenEstimate: 40, estimatedCostKrw: 0 })
      ]
    );

    expect(rows).toEqual([
      expect.objectContaining({ teacherId: "teacher-1", teacherName: "김하늘", totalTokenEstimate: 75, estimatedCostKrw: 1 }),
      expect.objectContaining({ teacherId: "teacher-2", teacherName: "이바다", totalTokenEstimate: 140, estimatedCostKrw: 0 })
    ]);

    const tree = AdminDashboardRoute({
      teachers: [teacher("teacher-1", "김하늘"), teacher("teacher-2", "이바다")],
      selectedTeacherIds: [],
      setSelectedTeacherIds: vi.fn(),
      approveSelectedTeachers: vi.fn(),
      createResetMailAction: vi.fn(),
      resetLog: "",
      usageSummaries: [
        usageSummary({ teacherId: "teacher-1", inputTokenEstimate: 25, outputTokenEstimate: 50, estimatedCostKrw: 1 }),
        usageSummary({ teacherId: "teacher-2", inputTokenEstimate: 100, outputTokenEstimate: 40, estimatedCostKrw: 0 })
      ]
    });

    const text = normalizeText(collectText(tree).join(" "));
    expect(text).toContain("교사별 사용량");
    expect(text).toContain("김하늘");
    expect(text).toContain("75 토큰");
    expect(text).toContain("예상 비용 1원");
    expect(text).not.toContain("conversation-1");
  });
});

function teacher(id: string, realName: string): IdentityTeacherAccount {
  return {
    id,
    realName,
    displayName: "",
    email: `${id}@example.com`,
    loginProvider: "password",
    passwordHash: "firebase-auth",
    school: {
      schoolName: "새빛중학교",
      schoolKind: "중학교",
      officeCode: "B10",
      standardSchoolCode: "1234567",
      region: "서울"
    },
    status: "approved",
    createdAt: "2026-06-13T01:00:00.000Z"
  };
}

function usageSummary(partial: Partial<MonthlyUsageSummary> & { teacherId: string }): MonthlyUsageSummary {
  return {
    teacherId: partial.teacherId,
    chatbotId: partial.chatbotId ?? "chatbot-1",
    month: partial.month ?? "2026-06",
    conversationCount: partial.conversationCount ?? 1,
    aiCallCount: partial.aiCallCount ?? 1,
    errorCount: partial.errorCount ?? 0,
    inputTokenEstimate: partial.inputTokenEstimate ?? 0,
    outputTokenEstimate: partial.outputTokenEstimate ?? 0,
    estimatedCostUsd: partial.estimatedCostUsd ?? 0,
    estimatedCostKrw: partial.estimatedCostKrw ?? 0,
    surfaces: partial.surfaces ?? {
      student_share: {
        conversationCount: 1,
        aiCallCount: 1,
        errorCount: 0,
        inputTokenEstimate: partial.inputTokenEstimate ?? 0,
        outputTokenEstimate: partial.outputTokenEstimate ?? 0
      },
      teacher_preview: {
        conversationCount: 0,
        aiCallCount: 0,
        errorCount: 0,
        inputTokenEstimate: 0,
        outputTokenEstimate: 0
      }
    }
  };
}

function collectText(node: unknown): string[] {
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectText);

  const props = "props" in node ? (node as { props?: { children?: unknown } }).props : undefined;
  return collectText(props?.children);
}

function collectElements(node: unknown, type: string): Array<{ props?: Record<string, unknown> }> {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => collectElements(child, type));

  const element = node as { type?: unknown; props?: { children?: unknown } };
  const current = element.type === type ? [element as { props?: Record<string, unknown> }] : [];
  return [...current, ...collectElements(element.props?.children, type)];
}

function collectClassBlocks(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectClassBlocks);

  const element = node as { props?: { children?: unknown; className?: string } };
  const className = element.props?.className;
  const current = typeof className === "string" ? className.split(/\s+/).filter(Boolean) : [];
  return [...current, ...collectClassBlocks(element.props?.children)];
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ");
}
