import { describe, expect, it, vi } from "vitest";
import {
  buildTeacherRegistrationPayload,
  canSubmitTeacherProfile,
} from "../../src/presentation/auth/teacherAuthForm";
import {
  TeacherAuthPanel,
  type TeacherAuthPanelProps,
} from "../../src/presentation/auth/TeacherAuthPanel";
import type { SchoolSearchResult } from "../../src/presentation/apiClient";

const selectedSchool: SchoolSearchResult = {
  schoolName: "등촌중학교",
  schoolKind: "중학교",
  officeCode: "B10",
  standardSchoolCode: "1234567",
  region: "서울",
  address: "서울특별시 강서구 등촌로 10",
};

describe("TeacherAuthPanel", () => {
  it("requires a selected NEIS school before profile registration", () => {
    expect(
      canSubmitTeacherProfile({
        realName: "김하늘",
        email: "teacher@example.com",
        selectedSchool: null,
      }),
    ).toBe(false);

    expect(
      canSubmitTeacherProfile({
        realName: "김하늘",
        email: "teacher@example.com",
        selectedSchool,
      }),
    ).toBe(true);
  });

  it("builds a server profile payload without sending the teacher password", () => {
    expect(
      buildTeacherRegistrationPayload({
        realName: " 김하늘 ",
        email: " TEACHER@example.com ",
        selectedSchool,
      }),
    ).toEqual({
      realName: "김하늘",
      email: "teacher@example.com",
      passwordHash: "firebase-auth",
      school: selectedSchool,
    });
  });

  it("renders selected school address and disables registration until a school is selected", () => {
    const missingSchoolTree = TeacherAuthPanel(
      createPanelProps({ selectedSchool: null }),
    );
    const missingSchoolText = collectText(missingSchoolTree).join(" ");
    const registerButton = collectNodes(missingSchoolTree).find(
      (node) => node.props?.["data-action"] === "register-profile",
    );

    expect(missingSchoolText).toContain(
      "학교를 직접 입력하지 말고 아래 목록에서 선택해 주세요.",
    );
    expect(registerButton?.props?.disabled).toBe(true);

    const selectedSchoolTree = TeacherAuthPanel(
      createPanelProps({ selectedSchool }),
    );
    const selectedSchoolText = collectText(selectedSchoolTree).join(" ");
    const enabledRegisterButton = collectNodes(selectedSchoolTree).find(
      (node) => node.props?.["data-action"] === "register-profile",
    );

    expect(selectedSchoolText).toContain("서울특별시 강서구 등촌로 10");
    expect(enabledRegisterButton?.props?.disabled).toBe(false);
  });

  it("shows school autocomplete state without a separate search button", () => {
    const tree = TeacherAuthPanel(
      createPanelProps({ isSearchingSchools: true, selectedSchool: null }),
    );
    const text = collectText(tree).join(" ");
    const buttons = collectNodes(tree).filter((node) => node.type === "button");

    expect(text).toContain("학교 목록을 불러오는 중입니다.");
    expect(
      buttons.map((button) => collectText(button).join(" ")),
    ).not.toContain("검색");
  });

  it("requires matching confirmation only for email sign-up", () => {
    const mismatchTree = TeacherAuthPanel(
      createPanelProps({
        password: "password123",
        passwordConfirmation: "password456",
      }),
    );
    const mismatchText = collectText(mismatchTree).join(" ");
    const mismatchSignUpButton = findButtonByText(mismatchTree, "이메일 가입");
    const signInButton = findButtonByText(mismatchTree, "이메일 로그인");

    expect(mismatchText).toContain("비밀번호가 일치하지 않습니다.");
    expect(mismatchSignUpButton?.props?.disabled).toBe(true);
    expect(signInButton?.props?.disabled).toBe(false);

    const matchTree = TeacherAuthPanel(
      createPanelProps({
        password: "password123",
        passwordConfirmation: "password123",
      }),
    );
    const matchText = collectText(matchTree).join(" ");
    const matchSignUpButton = findButtonByText(matchTree, "이메일 가입");

    expect(matchText).toContain("비밀번호가 일치합니다.");
    expect(matchSignUpButton?.props?.disabled).toBe(false);
  });

  it("renders auth errors in the side status and uses a Google-styled button", () => {
    const tree = TeacherAuthPanel(
      createPanelProps({ authError: "가입 요청 처리 중 문제가 생겼습니다." }),
    );
    const text = collectText(tree).join(" ");
    const statusNode = collectNodes(tree).find((node) =>
      String(node.props?.className ?? "").includes("auth-status error"),
    );
    const googleButton = findButtonByText(tree, "Google로 계속하기");

    expect(text).toContain("학교 확인 후");
    expect(text).toContain("가입 요청 처리 중 문제가 생겼습니다.");
    expect(statusNode).toBeDefined();
    expect(String(googleButton?.props?.className)).toContain(
      "google-auth-button",
    );
  });
});

function createPanelProps(
  overrides: Partial<TeacherAuthPanelProps> = {},
): TeacherAuthPanelProps {
  return {
    realName: "김하늘",
    email: "teacher@example.com",
    password: "password123",
    passwordConfirmation: "password123",
    showPassword: false,
    schoolQuery: "등촌중",
    schoolResults: [selectedSchool],
    selectedSchool,
    isSearchingSchools: false,
    isSubmitting: false,
    authStatus: "교사 계정으로 로그인하거나 가입해 주세요.",
    authError: "",
    onRealNameChange: vi.fn(),
    onEmailChange: vi.fn(),
    onPasswordChange: vi.fn(),
    onPasswordConfirmationChange: vi.fn(),
    onTogglePasswordVisibility: vi.fn(),
    onSchoolQueryChange: vi.fn(),
    onSelectSchool: vi.fn(),
    onEmailSignIn: vi.fn(),
    onEmailSignUp: vi.fn(),
    onGoogleSignIn: vi.fn(),
    onRegisterProfile: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  };
}

function findButtonByText(
  node: unknown,
  text: string,
): { type?: unknown; props?: Record<string, unknown> } | undefined {
  return collectNodes(node)
    .filter((candidate) => candidate.type === "button")
    .find((candidate) => collectText(candidate).join(" ").includes(text));
}

function collectText(node: unknown): string[] {
  if (typeof node === "string" || typeof node === "number")
    return [String(node)];
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectText);

  const props =
    "props" in node
      ? (node as { props?: { children?: unknown } }).props
      : undefined;
  return collectText(props?.children);
}

function collectNodes(
  node: unknown,
): Array<{ type?: unknown; props?: Record<string, unknown> }> {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectNodes);

  const props =
    "props" in node
      ? ((node as { props?: { children?: unknown } }).props ?? {})
      : {};
  return [
    node as { type?: unknown; props?: Record<string, unknown> },
    ...collectNodes(props.children),
  ];
}
