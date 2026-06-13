import { describe, expect, it } from "vitest";
import {
  resolveInitialView,
  shouldShowRoleNavigation,
  shouldUseFirebaseTeacherAuth,
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
});
