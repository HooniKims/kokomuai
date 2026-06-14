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
  schoolName: "Deungchon Middle School",
  schoolKind: "Middle School",
  officeCode: "B10",
  standardSchoolCode: "1234567",
  region: "Seoul",
  address: "Seoul Gangseo Deungchon-ro 10",
};

describe("TeacherAuthPanel", () => {
  it("requires a selected NEIS school before profile registration", () => {
    expect(
      canSubmitTeacherProfile({
        realName: "Teacher Kim",
        email: "teacher@example.com",
        selectedSchool: null,
      }),
    ).toBe(false);

    expect(
      canSubmitTeacherProfile({
        realName: "Teacher Kim",
        email: "teacher@example.com",
        selectedSchool,
      }),
    ).toBe(true);
  });

  it("builds a server profile payload without sending the teacher password", () => {
    expect(
      buildTeacherRegistrationPayload({
        realName: " Teacher Kim ",
        email: " TEACHER@example.com ",
        selectedSchool,
      }),
    ).toEqual({
      realName: "Teacher Kim",
      email: "teacher@example.com",
      passwordHash: "firebase-auth",
      school: selectedSchool,
    });
  });

  it("keeps the default login screen focused on login-only controls", () => {
    const tree = TeacherAuthPanel(createPanelProps({ mode: "login" }));
    const text = collectText(tree).join(" ");

    expect(findNodeByAction(tree, "email-login")).toBeDefined();
    expect(findNodeByAction(tree, "google-login")).toBeDefined();
    expect(findNodeByAction(tree, "email-signup")).toBeUndefined();
    expect(findNodeByAction(tree, "register-profile")).toBeUndefined();
    expect(findNodeByAction(tree, "switch-signup")).toBeDefined();
    expect(text).not.toContain("School Name");
  });

  it("does not show logout until a Firebase user is signed in", () => {
    const signedOutTree = TeacherAuthPanel(
      createPanelProps({ mode: "login", isSignedIn: false }),
    );
    const signedInTree = TeacherAuthPanel(
      createPanelProps({ mode: "login", isSignedIn: true }),
    );

    expect(collectText(signedOutTree).join(" ")).not.toContain("로그아웃");
    expect(collectText(signedInTree).join(" ")).toContain("로그아웃");
  });

  it("renders school registration only in signup mode", () => {
    const missingSchoolTree = TeacherAuthPanel(
      createPanelProps({
        mode: "signup",
        isSignedIn: true,
        selectedSchool: null,
      }),
    );
    const registerButton = findNodeByAction(missingSchoolTree, "register-profile");

    expect(registerButton?.props?.disabled).toBe(true);

    const selectedSchoolTree = TeacherAuthPanel(
      createPanelProps({
        mode: "signup",
        isSignedIn: true,
        selectedSchool,
      }),
    );
    const selectedSchoolText = collectText(selectedSchoolTree).join(" ");
    const enabledRegisterButton = findNodeByAction(
      selectedSchoolTree,
      "register-profile",
    );

    expect(selectedSchoolText).toContain("Seoul Gangseo Deungchon-ro 10");
    expect(enabledRegisterButton?.props?.disabled).toBe(false);
  });

  it("uses one signup request action after email, password, and school are ready", () => {
    const tree = TeacherAuthPanel(
      createPanelProps({
        mode: "signup",
        isSignedIn: false,
        selectedSchool,
        password: "password123",
        passwordConfirmation: "password123",
      }),
    );

    expect(findNodeByAction(tree, "email-signup")).toBeUndefined();
    expect(findNodeByAction(tree, "switch-login")).toBeUndefined();
    expect(findNodeByAction(tree, "register-profile")?.props?.disabled).toBe(
      false,
    );
  });

  it("keeps the unified signup request disabled until passwords match", () => {
    const tree = TeacherAuthPanel(
      createPanelProps({
        mode: "signup",
        isSignedIn: false,
        selectedSchool,
        password: "password123",
        passwordConfirmation: "password456",
      }),
    );

    expect(findNodeByAction(tree, "register-profile")?.props?.disabled).toBe(
      true,
    );
  });

  it("shows school autocomplete state without a separate search button", () => {
    const tree = TeacherAuthPanel(
      createPanelProps({
        mode: "signup",
        isSearchingSchools: true,
        selectedSchool: null,
      }),
    );
    const text = collectText(tree).join(" ");
    const buttons = collectNodes(tree).filter((node) => node.type === "button");

    expect(text).toContain("학교 목록을 불러오는 중입니다.");
    expect(
      buttons.map((button) => collectText(button).join(" ")),
    ).not.toContain("검색");
  });

  it("requires matching confirmation before the unified signup request", () => {
    const mismatchTree = TeacherAuthPanel(
      createPanelProps({
        mode: "signup",
        password: "password123",
        passwordConfirmation: "password456",
      }),
    );
    const mismatchText = collectText(mismatchTree).join(" ");
    const mismatchSignUpButton = findNodeByAction(
      mismatchTree,
      "register-profile",
    );

    expect(mismatchText).toContain("비밀번호가 일치하지 않습니다.");
    expect(mismatchSignUpButton?.props?.disabled).toBe(true);

    const matchTree = TeacherAuthPanel(
      createPanelProps({
        mode: "signup",
        password: "password123",
        passwordConfirmation: "password123",
      }),
    );
    const matchText = collectText(matchTree).join(" ");
    const matchSignUpButton = findNodeByAction(matchTree, "register-profile");

    expect(matchText).toContain("비밀번호가 일치합니다.");
    expect(matchSignUpButton?.props?.disabled).toBe(false);
  });

  it("keeps password visibility toggles out of the tab order", () => {
    const loginTree = TeacherAuthPanel(createPanelProps({ mode: "login" }));
    const signupTree = TeacherAuthPanel(createPanelProps({ mode: "signup" }));
    const loginToggleButtons = findNodesByClassName(
      loginTree,
      "password-toggle",
    );
    const signupToggleButtons = findNodesByClassName(
      signupTree,
      "password-toggle",
    );

    expect(loginToggleButtons).toHaveLength(1);
    expect(signupToggleButtons).toHaveLength(2);
    for (const toggleButton of [
      ...loginToggleButtons,
      ...signupToggleButtons,
    ]) {
      expect(toggleButton.type).toBe("button");
      expect(toggleButton.props?.tabIndex).toBe(-1);
    }
  });

  it("renders auth errors in the side status and uses a Google-styled button", () => {
    const tree = TeacherAuthPanel(
      createPanelProps({ authError: "Signup request failed." }),
    );
    const text = collectText(tree).join(" ");
    const statusNode = collectNodes(tree).find((node) =>
      String(node.props?.className ?? "").includes("auth-status error"),
    );
    const googleButton = findNodeByAction(tree, "google-login");

    expect(text).toContain("Signup request failed.");
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
    mode: "login",
    isSignedIn: false,
    realName: "Teacher Kim",
    email: "teacher@example.com",
    password: "password123",
    passwordConfirmation: "password123",
    showPassword: false,
    schoolQuery: "Deungchon",
    schoolResults: [selectedSchool],
    selectedSchool,
    isSearchingSchools: false,
    isSubmitting: false,
    authStatus: "Sign in or create a teacher account.",
    authError: "",
    onModeChange: vi.fn(),
    onRealNameChange: vi.fn(),
    onEmailChange: vi.fn(),
    onPasswordChange: vi.fn(),
    onPasswordConfirmationChange: vi.fn(),
    onTogglePasswordVisibility: vi.fn(),
    onSchoolQueryChange: vi.fn(),
    onSelectSchool: vi.fn(),
    onEmailSignIn: vi.fn(),
    onGoogleSignIn: vi.fn(),
    onRegisterProfile: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  };
}

function findNodeByAction(
  node: unknown,
  action: string,
): { type?: unknown; props?: Record<string, unknown> } | undefined {
  return collectNodes(node).find(
    (candidate) => candidate.props?.["data-action"] === action,
  );
}

function findNodesByClassName(
  node: unknown,
  className: string,
): Array<{ type?: unknown; props?: Record<string, unknown> }> {
  return collectNodes(node).filter((candidate) =>
    String(candidate.props?.className ?? "")
      .split(/\s+/)
      .includes(className),
  );
}

function collectText(node: unknown): string[] {
  if (typeof node === "string" || typeof node === "number")
    return [String(node)];
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (
    "type" in node &&
    typeof (node as { type?: unknown }).type === "function"
  ) {
    const element = node as {
      type: (props: Record<string, unknown>) => unknown;
      props?: Record<string, unknown>;
    };
    return collectText(element.type(element.props ?? {}));
  }

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
  if (
    "type" in node &&
    typeof (node as { type?: unknown }).type === "function"
  ) {
    const element = node as {
      type: (props: Record<string, unknown>) => unknown;
      props?: Record<string, unknown>;
    };
    return collectNodes(element.type(element.props ?? {}));
  }

  const props =
    "props" in node
      ? ((node as { props?: { children?: unknown } }).props ?? {})
      : {};
  return [
    node as { type?: unknown; props?: Record<string, unknown> },
    ...collectNodes(props.children),
  ];
}
