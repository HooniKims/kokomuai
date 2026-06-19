import { describe, expect, it, vi } from "vitest";
import {
  scrollCreatedChatbotIntoView,
  TeacherDashboardRoute,
} from "../../src/presentation/routes/TeacherDashboardRoute";
import type { ManagedChatbot } from "../../src/domain/chatbot/chatbotManagement";

describe("teacher chatbot creation focus", () => {
  it("scrolls the created chatbot row into view", () => {
    const createdRow = { scrollIntoView: vi.fn() };
    const querySelector = vi.fn((selector: string) =>
      selector === '[data-chatbot-id="chatbot-1"]' ? createdRow : null,
    );
    const doc = { querySelector };

    scrollCreatedChatbotIntoView("chatbot-1", doc);

    expect(querySelector).toHaveBeenCalledWith('[data-chatbot-id="chatbot-1"]');
    expect(createdRow.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });

  it("marks chatbot rows as scroll targets", () => {
    const tree = TeacherDashboardRoute({
      workspaceStatus: "교사 계정으로 연결됐습니다.",
      chatbots: [chatbot("chatbot-1")],
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
        questionLevel: "medium",
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
      shareNoticeChatbotId: "",
    });

    const row = collectNodes(tree).find(
      (node) => node.props?.["data-chatbot-id"] === "chatbot-1",
    );

    expect(row).toBeDefined();
  });

  it("applies learning goal and persona suggestions to the chatbot form", () => {
    const setChatbotForm = vi.fn();
    const form = {
      name: "",
      schoolLevel: "middle" as const,
      topic: "품사의 종류와 특성",
      learningGoal: "",
      subject: "국어",
      gradeBand: "1",
      persona: "",
      hintStrength: "low" as const,
      questionLevel: "easy" as const,
    };
    const tree = TeacherDashboardRoute({
      workspaceStatus: "교사 계정으로 연결됐습니다.",
      chatbots: [],
      usageConversationCount: 0,
      usageAiCallCount: 0,
      usageInputTokenCount: 0,
      usageOutputTokenCount: 0,
      usageEstimatedCostKrw: 0,
      activeTeacherId: "teacher-1",
      chatbotForm: form,
      setChatbotForm,
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
      shareNoticeChatbotId: "",
    });

    const goalSuggestion = collectNodes(tree).find(
      (node) => node.props?.["data-action"] === "apply-learning-goal-suggestion",
    );
    clickNode(goalSuggestion);

    expect(setChatbotForm).toHaveBeenCalledWith({
      ...form,
      learningGoal: "품사의 종류와 특성의 핵심 개념을 학생이 자기 말로 설명하도록 돕는다.",
    });

    const personaSuggestion = collectNodes(tree).find(
      (node) => node.props?.["data-action"] === "apply-persona-suggestion",
    );
    clickNode(personaSuggestion);

    expect(setChatbotForm).toHaveBeenCalledWith({
      ...form,
      persona: expect.stringContaining("답을 바로 말하지 않고"),
    });
  });

  it("renders question level next to hint strength and applies topic suggestions", () => {
    const setChatbotForm = vi.fn();
    const form = {
      name: "",
      schoolLevel: "middle" as const,
      topic: "",
      learningGoal: "",
      subject: "국어",
      gradeBand: "1",
      persona: "",
      hintStrength: "low" as const,
      questionLevel: "medium" as const,
    };
    const tree = TeacherDashboardRoute({
      workspaceStatus: "교사 계정으로 연결됐습니다.",
      chatbots: [],
      usageConversationCount: 0,
      usageAiCallCount: 0,
      usageInputTokenCount: 0,
      usageOutputTokenCount: 0,
      usageEstimatedCostKrw: 0,
      activeTeacherId: "teacher-1",
      chatbotForm: form,
      setChatbotForm,
      curriculumRecommendations: [recommendation()],
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
      shareNoticeChatbotId: "",
    });

    const text = collectText(tree).join(" ");
    expect(text).toContain("힌트 강도");
    expect(text).toContain("질문 수준");
    expect(text).toContain("쉽게");
    expect(text).toContain("어렵게");

    const topicSuggestion = collectNodes(tree).find(
      (node) => node.props?.["data-action"] === "apply-topic-suggestion",
    );
    clickNode(topicSuggestion);

    expect(setChatbotForm).toHaveBeenCalledWith({
      ...form,
      topic: "국어 문법: 품사의 종류와 특성 이해",
    });
  });
});

function chatbot(id: string): ManagedChatbot {
  return {
    id,
    ownerTeacherId: "teacher-1",
    name: "국어 9품사 이해",
    schoolLevel: "middle",
    gradeBand: "1",
    subject: "국어",
    topic: "품사의 종류와 특성",
    learningGoal: "문장 속 품사를 구분한다.",
    hintStrength: "medium",
    questionLevel: "medium",
    persona: "국어 선생님",
    curriculumLinks: [],
    lifecycle: { status: "active" },
    share: {
      enabled: true,
      publicToken: "public-token",
      expiresAt: null,
    },
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
  };
}

function recommendation() {
  return {
    chunkId: "korean-grammar",
    label: "추천" as const,
    reason: "수업 주제와 직접 이어집니다.",
    chunk: {
      id: "korean-grammar",
      sourceTitle: "국어",
      schoolLevel: "middle" as const,
      gradeBand: "1",
      subject: "국어",
      area: "문법",
      achievement: "[9국04-03] 품사의 종류와 특성을 이해하고 국어 자료를 분석한다.",
      excerpt: "품사의 종류와 특성을 이해한다.",
    },
  };
}

function collectNodes(
  node: unknown,
): Array<{ props?: Record<string, unknown> }> {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectNodes);

  const props =
    "props" in node
      ? ((node as { props?: { children?: unknown } }).props ?? {})
      : {};
  return [
    node as { props?: Record<string, unknown> },
    ...collectNodes(props.children),
  ];
}

function collectText(node: unknown): string[] {
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectText);

  const props =
    "props" in node
      ? ((node as { props?: { children?: unknown } }).props ?? {})
      : {};
  return collectText(props.children);
}

function clickNode(node: { props?: Record<string, unknown> } | undefined): void {
  const onClick = node?.props?.onClick;
  if (typeof onClick === "function") onClick();
}
