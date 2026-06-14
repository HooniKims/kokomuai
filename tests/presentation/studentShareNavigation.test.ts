import { describe, expect, it } from "vitest";
import {
  isFirebaseEmailAlreadyInUse,
  resolveInitialView,
  shouldShowRoleNavigation,
  shouldUseFirebaseTeacherAuth,
  toFriendlyFirebaseAuthError,
  toFriendlySignupRequestError,
} from "../../src/presentation/App";

describe("student share navigation", () => {
  it("hides role navigation because operator role is derived from the account", () => {
    expect(shouldShowRoleNavigation("/s/public-token")).toBe(false);
    expect(shouldShowRoleNavigation("/s/public-token?preview=1")).toBe(false);
    expect(shouldShowRoleNavigation("/")).toBe(false);
    expect(shouldShowRoleNavigation("/teacher")).toBe(false);
    expect(shouldShowRoleNavigation("/admin")).toBe(false);
  });

  it("uses Firebase teacher auth only on operator pages when Firebase is configured", () => {
    expect(shouldUseFirebaseTeacherAuth("/", true, true)).toBe(true);
    expect(shouldUseFirebaseTeacherAuth("/admin", true, true)).toBe(true);
    expect(shouldUseFirebaseTeacherAuth("/s/public-token", true, true)).toBe(
      false,
    );
    expect(shouldUseFirebaseTeacherAuth("/", false, true)).toBe(false);
    expect(shouldUseFirebaseTeacherAuth("/", true, false)).toBe(false);
  });

  it("opens operator pages by path and reserves the student view for share links", () => {
    expect(resolveInitialView("/")).toBe("teacher");
    expect(resolveInitialView("/teacher")).toBe("teacher");
    expect(resolveInitialView("/admin")).toBe("admin");
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
        "Login failed",
      ),
    ).toBe("이메일 또는 비밀번호가 맞지 않습니다. 다시 확인해 주세요.");
  });

  it("does not expose raw invalid_token errors during signup requests", () => {
    const message = toFriendlySignupRequestError(new Error("invalid_token"));

    expect(message).toContain("로그인 토큰");
    expect(message).not.toContain("invalid_token");
  });
});
