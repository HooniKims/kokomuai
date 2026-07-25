import { describe, expect, it, vi } from "vitest";
import { TeacherDashboardRoute } from "../../src/presentation/routes/TeacherDashboardRoute";
import type { ManagedChatbot } from "../../src/domain/chatbot/chatbotManagement";

describe("share QR download action", () => {
  it("offers a QR download for a shared chatbot and passes it to the handler", () => {
    const downloadShareQr = vi.fn();
    const shared = chatbot({ enabled: true });
    const tree = TeacherDashboardRoute(baseProps({
      chatbots: [shared],
      downloadShareQr,
    }));

    const trigger = collectNodes(tree).find(
      (node) => node.props?.["data-action"] === "download-share-qr",
    );

    expect(trigger).toBeDefined();
    expect(collectText(trigger).join(" ")).toContain("QR 다운로드");

    clickNode(trigger);
    expect(downloadShareQr).toHaveBeenCalledWith(shared);
  });

  it("hides the QR download until sharing is enabled", () => {
    const tree = TeacherDashboardRoute(baseProps({
      chatbots: [chatbot({ enabled: false })],
      downloadShareQr: vi.fn(),
    }));

    const trigger = collectNodes(tree).find(
      (node) => node.props?.["data-action"] === "download-share-qr",
    );

    expect(trigger).toBeUndefined();
  });

  it("disables the QR download only for the row with a download in flight", () => {
    const inFlight = chatbot({ enabled: true });
    const other = { ...chatbot({ enabled: true }), id: "chatbot-2", name: "다른 챗봇" };
    const tree = TeacherDashboardRoute(baseProps({
      chatbots: [inFlight, other],
      pendingShareQrChatbotId: inFlight.id,
    }));

    const triggers = collectNodes(tree).filter(
      (node) => node.props?.["data-action"] === "download-share-qr",
    );

    expect(triggers).toHaveLength(2);
    expect(triggers[0]?.props?.disabled).toBe(true);
    expect(triggers[0]?.props?.["aria-busy"]).toBe(true);
    expect(triggers[1]?.props?.disabled).toBe(false);
    expect(triggers[1]?.props?.["aria-busy"]).toBe(false);
  });
});

function baseProps(
  overrides: Partial<Parameters<typeof TeacherDashboardRoute>[0]>,
): Parameters<typeof TeacherDashboardRoute>[0] {
  return {
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
    downloadShareQr: vi.fn(),
    pendingShareQrChatbotId: "",
    shareNotice: "",
    shareNoticeChatbotId: "",
    ...overrides,
  };
}

function chatbot({ enabled }: { enabled: boolean }): ManagedChatbot {
  return {
    id: "chatbot-1",
    ownerTeacherId: "teacher-1",
    name: "분수의 덧셈 도우미",
    schoolLevel: "elementary",
    gradeBand: "5-6",
    subject: "수학",
    topic: "분수의 덧셈",
    learningGoal: "분모가 다른 분수를 더한다.",
    hintStrength: "medium",
    questionLevel: "easy",
    persona: "수학 선생님",
    curriculumLinks: [],
    lifecycle: { status: "active" },
    share: {
      enabled,
      publicToken: enabled ? "public-token" : "",
      expiresAt: null,
    },
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
  };
}

function collectNodes(
  node: unknown,
): Array<{ props?: Record<string, unknown>; type?: unknown }> {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectNodes);

  const props =
    "props" in node
      ? ((node as { props?: { children?: unknown } }).props ?? {})
      : {};
  return [
    node as { props?: Record<string, unknown>; type?: unknown },
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
