import { describe, expect, it } from "vitest";
import {
  shouldLoadAdminWorkspaceResources,
  shouldShowTeacherWorkspace,
} from "../../src/presentation/App";
import type { IdentityTeacherAccount } from "../../src/domain/identity/identityAccess";

describe("admin workspace loading", () => {
  it("loads admin-only resources only for admin profiles", () => {
    expect(shouldLoadAdminWorkspaceResources(teacher("admin"))).toBe(true);
    expect(shouldLoadAdminWorkspaceResources(teacher("approved"))).toBe(false);
    expect(shouldLoadAdminWorkspaceResources(null)).toBe(false);
  });

  it("shows the teacher workspace for admins as well as approved teachers", () => {
    expect(shouldShowTeacherWorkspace("teacher", teacher("approved"), false)).toBe(
      true,
    );
    expect(shouldShowTeacherWorkspace("admin", teacher("admin"), false)).toBe(
      true,
    );
    expect(shouldShowTeacherWorkspace("admin", teacher("approved"), false)).toBe(
      false,
    );
    expect(shouldShowTeacherWorkspace("student", teacher("admin"), false)).toBe(
      false,
    );
    expect(shouldShowTeacherWorkspace("admin", teacher("admin"), true)).toBe(
      false,
    );
  });
});

function teacher(
  status: IdentityTeacherAccount["status"],
): IdentityTeacherAccount {
  return {
    id: "teacher-1",
    realName: "김하늘",
    displayName: "",
    email: "teacher@example.com",
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
    createdAt: "2026-06-13T00:00:00.000Z",
  };
}
