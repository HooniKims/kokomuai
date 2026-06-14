import { describe, expect, it, vi } from "vitest";
import type { ManagedChatbot } from "../../src/domain/chatbot/chatbotManagement";
import type { IdentityTeacherAccount } from "../../src/domain/identity/identityAccess";
import type { MonthlyUsageSummary } from "../../src/domain/usage/usageAccounting";
import { AdminDashboardRoute } from "../../src/presentation/routes/AdminDashboardRoute";

describe("AdminDashboardRoute operation panel", () => {
  it("exposes operation toggles with search and teacher category controls", () => {
    const setAdminOperationView = vi.fn();
    const setAdminOperationSearch = vi.fn();
    const setAdminTeacherCategory = vi.fn();

    const tree = AdminDashboardRoute({
      teachers: [teacher("teacher-1", "김하늘", "approved")],
      selectedTeacherIds: [],
      setSelectedTeacherIds: vi.fn(),
      approveSelectedTeachers: vi.fn(),
      createResetMailAction: vi.fn(),
      resetLog: "",
      chatbots: [chatbot("chatbot-1", "수학 일차함수 챗봇", "active")],
      adminOperationView: "teacher",
      setAdminOperationView,
      adminOperationSearch: "",
      setAdminOperationSearch,
      adminTeacherCategory: "all",
      setAdminTeacherCategory,
    });

    findNodeByAction(tree, "admin-view-chatbot")?.props.onClick();
    findNodeByAction(tree, "admin-view-usage")?.props.onClick();
    findNodeByAction(tree, "admin-operation-search")?.props.onChange({
      target: { value: "수학" },
    });
    findNodeByAction(tree, "admin-teacher-category")?.props.onChange({
      target: { value: "pending" },
    });

    const text = normalizeText(collectText(tree).join(" "));
    expect(text).toContain("교사별 접근");
    expect(text).toContain("전체 챗봇 운영");
    expect(text).toContain("사용량 순위");
    expect(setAdminOperationView).toHaveBeenCalledWith("chatbot");
    expect(setAdminOperationView).toHaveBeenCalledWith("usage");
    expect(setAdminOperationSearch).toHaveBeenCalledWith("수학");
    expect(setAdminTeacherCategory).toHaveBeenCalledWith("pending");
  });

  it("filters chatbot operations by search text and teacher category", () => {
    const tree = AdminDashboardRoute({
      teachers: [
        teacher("teacher-1", "김하늘", "approved"),
        teacher("teacher-2", "박바다", "pending"),
      ],
      selectedTeacherIds: [],
      setSelectedTeacherIds: vi.fn(),
      approveSelectedTeachers: vi.fn(),
      createResetMailAction: vi.fn(),
      resetLog: "",
      chatbots: [
        chatbot("chatbot-1", "국어 품사 챗봇", "active", "teacher-1"),
        chatbot("chatbot-2", "과학 생물 챗봇", "active", "teacher-2"),
      ],
      adminOperationView: "chatbot",
      adminOperationSearch: "과학",
      adminTeacherCategory: "pending",
    });

    const text = normalizeText(collectText(tree).join(" "));
    expect(text).toContain("과학 생물 챗봇");
    expect(text).not.toContain("국어 품사 챗봇");
  });

  it("renders usage ranking in descending activity order", () => {
    const tree = AdminDashboardRoute({
      teachers: [
        teacher("teacher-1", "김하늘", "approved"),
        teacher("teacher-2", "박바다", "approved"),
      ],
      selectedTeacherIds: [],
      setSelectedTeacherIds: vi.fn(),
      approveSelectedTeachers: vi.fn(),
      createResetMailAction: vi.fn(),
      resetLog: "",
      usageSummaries: [
        usage("teacher-1", 2, 1000),
        usage("teacher-2", 9, 3000),
      ],
      adminOperationView: "usage",
    });

    const text = normalizeText(collectText(tree).join(" "));
    expect(text).toContain("사용량 순위");
    expect(text.indexOf("1위")).toBeLessThan(text.indexOf("2위"));
    expect(text.lastIndexOf("박바다")).toBeLessThan(text.lastIndexOf("김하늘"));
  });
});

function teacher(
  id: string,
  realName: string,
  status: IdentityTeacherAccount["status"],
): IdentityTeacherAccount {
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
      region: "서울",
    },
    status,
    createdAt: "2026-06-13T01:00:00.000Z",
  };
}

function chatbot(
  id: string,
  name: string,
  status: ManagedChatbot["lifecycle"]["status"],
  ownerTeacherId = "teacher-1",
): ManagedChatbot {
  return {
    id,
    ownerTeacherId,
    name,
    schoolLevel: "middle",
    gradeBand: "1",
    subject: name.includes("과학") ? "과학" : "국어",
    topic: "수업 주제",
    learningGoal: "학습 목표",
    hintStrength: "medium",
    persona: "교사",
    curriculumLinks: [],
    lifecycle: { status },
    share: {
      enabled: status === "active",
      publicToken: status === "active" ? `${id}-public-token` : "",
      expiresAt: null,
    },
    createdAt: "2026-06-13T01:00:00.000Z",
    updatedAt: "2026-06-13T01:00:00.000Z",
  };
}

function usage(
  teacherId: string,
  conversationCount: number,
  totalTokenEstimate: number,
): MonthlyUsageSummary {
  return {
    teacherId,
    chatbotId: `${teacherId}-chatbot`,
    month: "2026-06",
    conversationCount,
    aiCallCount: conversationCount,
    errorCount: 0,
    inputTokenEstimate: Math.round(totalTokenEstimate / 2),
    outputTokenEstimate: Math.round(totalTokenEstimate / 2),
    estimatedCostUsd: 0,
    estimatedCostKrw: Math.round(totalTokenEstimate / 10),
    surfaces: {
      student_share: {
        conversationCount,
        aiCallCount: conversationCount,
        errorCount: 0,
        inputTokenEstimate: Math.round(totalTokenEstimate / 2),
        outputTokenEstimate: Math.round(totalTokenEstimate / 2),
      },
      teacher_preview: {
        conversationCount: 0,
        aiCallCount: 0,
        errorCount: 0,
        inputTokenEstimate: 0,
        outputTokenEstimate: 0,
      },
    },
  };
}

function findNodeByAction(
  node: unknown,
  action: string,
): { props: Record<string, any> } | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findNodeByAction(child, action);
      if (match) return match;
    }
    return null;
  }

  const props = "props" in node ? (node as { props?: Record<string, any> }).props : undefined;
  if (props?.["data-action"] === action) return { props };
  return findNodeByAction(props?.children, action);
}

function collectText(node: unknown): string[] {
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectText);

  const props = "props" in node ? (node as { props?: { children?: unknown } }).props : undefined;
  return collectText(props?.children);
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ");
}
