import { describe, expect, it, vi } from "vitest";
import { buildTeacherRegistrationPayload, canSubmitTeacherProfile } from "../../src/presentation/auth/teacherAuthForm";
import { TeacherAuthPanel } from "../../src/presentation/auth/TeacherAuthPanel";
import type { SchoolSearchResult } from "../../src/presentation/apiClient";

const selectedSchool: SchoolSearchResult = {
  schoolName: "새빛중학교",
  schoolKind: "중학교",
  officeCode: "B10",
  standardSchoolCode: "1234567",
  region: "서울",
  address: "서울특별시 강남구 새빛로 10"
};

describe("TeacherAuthPanel", () => {
  it("requires a selected NEIS school before profile registration", () => {
    expect(
      canSubmitTeacherProfile({
        realName: "김하늘",
        email: "teacher@example.com",
        selectedSchool: null
      })
    ).toBe(false);

    expect(
      canSubmitTeacherProfile({
        realName: "김하늘",
        email: "teacher@example.com",
        selectedSchool
      })
    ).toBe(true);
  });

  it("builds a server profile payload without sending the teacher password", () => {
    expect(
      buildTeacherRegistrationPayload({
        realName: " 김하늘 ",
        email: " TEACHER@example.com ",
        selectedSchool
      })
    ).toEqual({
      realName: "김하늘",
      email: "teacher@example.com",
      passwordHash: "firebase-auth",
      school: {
        schoolName: "새빛중학교",
        schoolKind: "중학교",
        officeCode: "B10",
        standardSchoolCode: "1234567",
        region: "서울",
        address: "서울특별시 강남구 새빛로 10"
      }
    });
  });

  it("renders selected school address and disables registration until a school is selected", () => {
    const missingSchoolTree = TeacherAuthPanel({
      realName: "김하늘",
      email: "teacher@example.com",
      password: "password123",
      schoolQuery: "새빛중",
      schoolResults: [selectedSchool],
      selectedSchool: null,
      isSearchingSchools: false,
      isSubmitting: false,
      authStatus: "교사 계정으로 로그인하거나 가입해 주세요.",
      authError: "",
      onRealNameChange: vi.fn(),
      onEmailChange: vi.fn(),
      onPasswordChange: vi.fn(),
      onSchoolQueryChange: vi.fn(),
      onSearchSchools: vi.fn(),
      onSelectSchool: vi.fn(),
      onEmailSignIn: vi.fn(),
      onEmailSignUp: vi.fn(),
      onGoogleSignIn: vi.fn(),
      onRegisterProfile: vi.fn(),
      onSignOut: vi.fn()
    });
    const missingSchoolText = collectText(missingSchoolTree).join(" ");
    const registerButton = collectNodes(missingSchoolTree).find((node) => node.props?.["data-action"] === "register-profile");

    expect(missingSchoolText).toContain("학교 검색 결과에서 선택해야 가입할 수 있습니다.");
    expect(registerButton?.props?.disabled).toBe(true);

    const selectedSchoolTree = TeacherAuthPanel({
      realName: "김하늘",
      email: "teacher@example.com",
      password: "password123",
      schoolQuery: "새빛중",
      schoolResults: [selectedSchool],
      selectedSchool,
      isSearchingSchools: false,
      isSubmitting: false,
      authStatus: "Firebase 계정이 확인됐습니다.",
      authError: "",
      onRealNameChange: vi.fn(),
      onEmailChange: vi.fn(),
      onPasswordChange: vi.fn(),
      onSchoolQueryChange: vi.fn(),
      onSearchSchools: vi.fn(),
      onSelectSchool: vi.fn(),
      onEmailSignIn: vi.fn(),
      onEmailSignUp: vi.fn(),
      onGoogleSignIn: vi.fn(),
      onRegisterProfile: vi.fn(),
      onSignOut: vi.fn()
    });
    const selectedSchoolText = collectText(selectedSchoolTree).join(" ");
    const enabledRegisterButton = collectNodes(selectedSchoolTree).find((node) => node.props?.["data-action"] === "register-profile");

    expect(selectedSchoolText).toContain("서울특별시 강남구 새빛로 10");
    expect(enabledRegisterButton?.props?.disabled).toBe(false);
  });
});

function collectText(node: unknown): string[] {
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectText);

  const props = "props" in node ? (node as { props?: { children?: unknown } }).props : undefined;
  return collectText(props?.children);
}

function collectNodes(node: unknown): Array<{ props?: Record<string, unknown> }> {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectNodes);

  const props = "props" in node ? ((node as { props?: { children?: unknown } }).props ?? {}) : {};
  return [node as { props?: Record<string, unknown> }, ...collectNodes(props.children)];
}
