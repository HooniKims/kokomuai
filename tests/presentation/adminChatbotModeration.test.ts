import { describe, expect, it, vi } from "vitest";
import type { ManagedChatbot } from "../../src/domain/chatbot/chatbotManagement";
import type { IdentityTeacherAccount } from "../../src/domain/identity/identityAccess";
import { AdminDashboardRoute } from "../../src/presentation/routes/AdminDashboardRoute";

describe("AdminDashboardRoute chatbot moderation", () => {
  it("labels the admin password reset email action clearly", () => {
    const tree = AdminDashboardRoute({
      teachers: [teacher("teacher-1", "김하늘")],
      selectedTeacherIds: [],
      setSelectedTeacherIds: vi.fn(),
      approveSelectedTeachers: vi.fn(),
      createResetMailAction: vi.fn(),
      resetLog: ""
    });

    const text = normalizeText(collectText(tree).join(" "));

    expect(text).toContain("비밀번호 초기화 메일");
  });

  it("renders active chatbots with an admin disable action", () => {
    const disableChatbotAsAdmin = vi.fn();
    const tree = AdminDashboardRoute({
      teachers: [teacher("teacher-1", "김하늘")],
      selectedTeacherIds: [],
      setSelectedTeacherIds: vi.fn(),
      approveSelectedTeachers: vi.fn(),
      createResetMailAction: vi.fn(),
      resetLog: "",
      chatbots: [chatbot("chatbot-1", "중학교 국어 품사", "active")],
      disableChatbotAsAdmin
    });

    const text = normalizeText(collectText(tree).join(" "));

    expect(text).toContain("챗봇 운영");
    expect(text).toContain("중학교 국어 품사");
    expect(text).toContain("비활성화");
  });

  it("filters chatbot operations by the teacher selected for review", () => {
    const tree = AdminDashboardRoute({
      teachers: [teacher("teacher-1", "김하늘"), teacher("teacher-2", "이바다")],
      selectedTeacherIds: [],
      setSelectedTeacherIds: vi.fn(),
      approveSelectedTeachers: vi.fn(),
      createResetMailAction: vi.fn(),
      resetLog: "",
      chatbots: [
        chatbot("chatbot-1", "김하늘 국어 챗봇", "active", "teacher-1"),
        chatbot("chatbot-2", "이바다 과학 챗봇", "active", "teacher-2")
      ],
      selectedReviewTeacherId: "teacher-2",
      setSelectedReviewTeacherId: vi.fn()
    });

    const text = normalizeText(collectText(tree).join(" "));

    expect(text).toContain("교사별 챗봇 확인");
    expect(text).toContain("이바다 과학 챗봇");
    expect(text).not.toContain("김하늘 국어 챗봇");
  });

  it("renders a teacher disable action next to approved teacher accounts", () => {
    const tree = AdminDashboardRoute({
      teachers: [teacher("teacher-1", "김하늘")],
      selectedTeacherIds: [],
      setSelectedTeacherIds: vi.fn(),
      approveSelectedTeachers: vi.fn(),
      createResetMailAction: vi.fn(),
      resetLog: "",
      disableTeacherAsAdmin: vi.fn()
    });

    const text = normalizeText(collectText(tree).join(" "));

    expect(text).toContain("김하늘");
    expect(text).toContain("교사 사용 중지");
  });

  it("renders rejection controls and admin action logs", () => {
    const tree = AdminDashboardRoute({
      teachers: [teacher("teacher-1", "김하늘")],
      selectedTeacherIds: ["teacher-1"],
      setSelectedTeacherIds: vi.fn(),
      approveSelectedTeachers: vi.fn(),
      createResetMailAction: vi.fn(),
      resetLog: "",
      rejectionReason: "학교 정보 확인 필요",
      setRejectionReason: vi.fn(),
      rejectSelectedTeachers: vi.fn(),
      adminActionLogs: [
        {
          id: "admin-log-1",
          type: "admin_action_logged",
          action: "teacher_rejected",
          adminId: "local-admin",
          targetTeacherId: "teacher-1",
          createdAt: "2026-06-13T01:00:00.000Z",
          reason: "rejection_reason_recorded_on_teacher"
        }
      ]
    });

    const text = normalizeText(collectText(tree).join(" "));

    expect(text).toContain("거절 사유");
    expect(text).toContain("선택 거절");
    expect(text).toContain("관리자 작업 로그");
    expect(text).toContain("teacher_rejected");
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

function chatbot(id: string, name: string, status: ManagedChatbot["lifecycle"]["status"], ownerTeacherId = "teacher-1"): ManagedChatbot {
  return {
    id,
    ownerTeacherId,
    name,
    schoolLevel: "middle",
    gradeBand: "1",
    subject: "국어",
    topic: "품사의 종류와 특성",
    learningGoal: "품사의 역할을 문장 속에서 구분한다.",
    hintStrength: "medium",
    persona: "답을 바로 주지 않고 질문으로 돕는 국어 선생님",
    curriculumLinks: [],
    lifecycle: { status },
    share: {
      enabled: status === "active",
      publicToken: status === "active" ? "public-token-123456" : "",
      expiresAt: null
    },
    createdAt: "2026-06-13T01:00:00.000Z",
    updatedAt: "2026-06-13T01:00:00.000Z"
  };
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
