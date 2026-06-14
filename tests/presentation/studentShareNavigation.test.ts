import { describe, expect, it } from "vitest";
import {
  isFirebaseEmailAlreadyInUse,
  resolveInitialView,
  shouldShowRoleNavigation,
  shouldUseFirebaseTeacherAuth,
  toFriendlyFirebaseAuthError,
} from "../../src/presentation/App";

describe("student share navigation", () => {
  it("hides role navigation on student share links", () => {
    expect(shouldShowRoleNavigation("/s/public-token")).toBe(false);
    expect(shouldShowRoleNavigation("/s/public-token?preview=1")).toBe(false);
  });

  it("shows role navigation on the local operator page", () => {
    expect(shouldShowRoleNavigation("/")).toBe(true);
    expect(shouldShowRoleNavigation("/teacher")).toBe(true);
  });

  it("uses Firebase teacher auth only on operator pages when Firebase is configured", () => {
    expect(shouldUseFirebaseTeacherAuth("/", true, true)).toBe(true);
    expect(shouldUseFirebaseTeacherAuth("/s/public-token", true, true)).toBe(
      false,
    );
    expect(shouldUseFirebaseTeacherAuth("/", false, true)).toBe(false);
    expect(shouldUseFirebaseTeacherAuth("/", true, false)).toBe(false);
  });

  it("opens the teacher workspace first and reserves the student view for share links", () => {
    expect(resolveInitialView("/")).toBe("teacher");
    expect(resolveInitialView("/teacher")).toBe("teacher");
    expect(resolveInitialView("/s/public-token")).toBe("student");
  });

  it("maps Firebase auth errors to operator-friendly messages", () => {
    expect(
      isFirebaseEmailAlreadyInUse({
        code: "auth/email-already-in-use",
      }),
    ).toBe(true);
    expect(
      toFriendlyFirebaseAuthError(
        { code: "auth/invalid-credential" },
        "로그인 실패",
      ),
    ).toBe("이메일 또는 비밀번호가 맞지 않습니다. 다시 확인해 주세요.");
  });
});
