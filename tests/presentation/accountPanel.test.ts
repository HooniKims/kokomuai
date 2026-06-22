import { describe, expect, it, vi } from "vitest";
import { AccountPanel } from "../../src/presentation/App";

const teacher = {
  id: "teacher-1",
  realName: "김형훈",
  displayName: "",
  email: "greenguyhh@gmail.com",
  loginProvider: "password" as const,
  passwordHash: "firebase-auth",
  school: {
    schoolName: "등촌중학교",
    schoolKind: "중학교",
    officeCode: "B10",
    standardSchoolCode: "1234567",
    region: "서울",
  },
  status: "admin" as const,
  createdAt: "2026-06-14T00:00:00.000Z",
};

describe("AccountPanel", () => {
  it("shows the teacher name below the primary email", () => {
    const tree = AccountPanel(createPanelProps());
    const text = collectText(tree).join(" ");

    expect(text).toContain("greenguyhh@gmail.com");
    expect(text).toContain("김형훈");
  });

  it("keeps password fields hidden until password change is selected", () => {
    const closedTree = AccountPanel(createPanelProps());

    expect(findNodeByAction(closedTree, "open-password-change")).toBeDefined();
    expect(findNodeByAction(closedTree, "submit-password-change")).toBeUndefined();
    expect(findInputByAutoComplete(closedTree, "current-password")).toBeUndefined();

    const openTree = AccountPanel(
      createPanelProps({
        isPasswordChangeOpen: true,
      }),
    );
    const openText = collectText(openTree).join(" ");

    expect(openText).toContain("현재 비밀번호");
    expect(openText).toContain("새 비밀번호");
    expect(openText).toContain("새 비밀번호 확인");
    expect(openText).toContain("비밀번호를 잊었을 때는 관리자에게 문의해 주세요.");
    expect(openText).toContain("02-6380-8339");
    expect(findNodeByAction(openTree, "submit-password-change")).toBeDefined();
    expect(findInputByAutoComplete(openTree, "current-password")).toBeDefined();
  });

  it("uses a compact withdrawal button", () => {
    const tree = AccountPanel(createPanelProps());
    const button = findNodeByAction(tree, "withdraw-account");

    expect(String(button?.props?.className)).toContain("compact-danger");
  });
});

function createPanelProps(
  overrides: Partial<Parameters<typeof AccountPanel>[0]> = {},
): Parameters<typeof AccountPanel>[0] {
  return {
    teacher,
    email: "greenguyhh@gmail.com",
    currentPassword: "",
    newPassword: "",
    newPasswordConfirm: "",
    notice: "",
    isBusy: false,
    isConfirmingWithdrawal: false,
    isPasswordChangeOpen: false,
    setCurrentPassword: vi.fn(),
    setNewPassword: vi.fn(),
    setNewPasswordConfirm: vi.fn(),
    setIsPasswordChangeOpen: vi.fn(),
    updatePassword: vi.fn(),
    withdrawAccount: vi.fn(),
    ...overrides,
  };
}

function findNodeByAction(
  node: unknown,
  action: string,
): { props?: Record<string, unknown> } | undefined {
  return collectNodes(node).find(
    (candidate) => candidate.props?.["data-action"] === action,
  );
}

function collectText(node: unknown): string[] {
  if (typeof node === "string" || typeof node === "number")
    return [String(node)];
  if (!node || typeof node !== "object") return [];

  const candidate = node as { props?: { children?: unknown } };
  const children = candidate.props?.children;
  if (Array.isArray(children)) return children.flatMap(collectText);
  return collectText(children);
}

function collectNodes(node: unknown): Array<{ props?: Record<string, unknown> }> {
  if (!node || typeof node !== "object") return [];
  const candidate = node as { props?: { children?: unknown } };
  const children = candidate.props?.children;
  const childNodes = Array.isArray(children)
    ? children.flatMap(collectNodes)
    : collectNodes(children);
  return [candidate, ...childNodes];
}

function findInputByAutoComplete(
  node: unknown,
  autoComplete: string,
): { props?: Record<string, unknown> } | undefined {
  return collectNodes(node).find(
    (candidate) => candidate.props?.autoComplete === autoComplete,
  );
}
