import { describe, expect, it } from "vitest";
import {
  toUserFacingErrorMessage,
  toWorkspaceConnectionErrorMessage,
} from "../../src/presentation/userFacingError";
import {
  toFriendlyFirebaseAuthError,
  toFriendlySignupRequestError,
} from "../../src/presentation/App";

describe("App error helpers route through the translator", () => {
  it("does not show a raw Firebase error string to the user", () => {
    const raw = new Error("Firebase: Error (auth/too-many-requests).");

    const message = toFriendlyFirebaseAuthError(raw, "로그인에 실패했습니다.");

    expect(message).toBe("로그인에 실패했습니다.");
    expect(message).not.toContain("Firebase");
    expect(message).not.toContain("auth/");
  });

  it("keeps its specific copy for the Firebase codes it recognizes", () => {
    const wrongPassword = Object.assign(new Error("Firebase: Error (auth/wrong-password)."), {
      code: "auth/wrong-password",
    });

    expect(toFriendlyFirebaseAuthError(wrongPassword, "로그인에 실패했습니다.")).toBe(
      "비밀번호가 맞지 않습니다. 다시 확인해 주세요.",
    );
  });

  it("translates an internal code instead of printing it during signup", () => {
    const message = toFriendlySignupRequestError(new Error("teacher_not_approved"));

    expect(message).toBe("관리자 승인을 기다리는 계정입니다.");
    expect(message).not.toContain("teacher_not_approved");
  });
});

describe("toWorkspaceConnectionErrorMessage", () => {
  it("translates the server's internal auth codes into Korean", () => {
    expect(toWorkspaceConnectionErrorMessage(new Error("auth_required"))).toBe(
      "로그인이 필요합니다. 다시 로그인한 뒤 시도해 주세요.",
    );
    expect(
      toWorkspaceConnectionErrorMessage(new Error("teacher_profile_not_found")),
    ).toBe("교사 정보를 찾지 못했습니다. 가입 요청을 먼저 보내 주세요.");
    expect(
      toWorkspaceConnectionErrorMessage(new Error("teacher_not_approved")),
    ).toBe("관리자 승인을 기다리는 계정입니다.");
    expect(toWorkspaceConnectionErrorMessage(new Error("invalid_token"))).toBe(
      "로그인 정보를 확인하지 못했습니다. 새로고침 후 다시 로그인해 주세요.",
    );
    expect(
      toWorkspaceConnectionErrorMessage(new Error("admin_not_allowed")),
    ).toBe("이 계정에는 관리자 권한이 없습니다.");
  });

  it("reports an unreachable server as a connection failure", () => {
    // What a teacher sees today when the API is not running.
    for (const thrown of [
      "Failed to fetch",
      "NetworkError when attempting to fetch resource.",
      "Load failed",
    ]) {
      expect(toWorkspaceConnectionErrorMessage(new Error(thrown))).toBe(
        "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
  });

  it("does not blame the connection when the server answered with a missing record", () => {
    expect(toWorkspaceConnectionErrorMessage(new Error("teacher_not_found"))).toBe(
      "교사 정보를 찾지 못했습니다.",
    );
    expect(toWorkspaceConnectionErrorMessage(new Error("share_not_found"))).toBe(
      "공유 링크를 찾지 못했습니다. 링크가 만료됐을 수 있습니다.",
    );
    expect(toWorkspaceConnectionErrorMessage(new Error("chatbot_forbidden"))).toBe(
      "이 챗봇에 접근할 권한이 없습니다.",
    );
  });

  it("never hands back an inherited object property as a message", () => {
    for (const thrown of ["constructor", "toString", "valueOf", "hasOwnProperty"]) {
      expect(toWorkspaceConnectionErrorMessage(new Error(thrown))).toBe(
        "로컬 서버와 연결하지 못했습니다.",
      );
    }
  });

  it("uses the caller's fallback for an unrecognized internal string", () => {
    expect(
      toUserFacingErrorMessage(new Error("provider_error"), "AI 응답을 받지 못했습니다."),
    ).toBe("AI 응답을 받지 못했습니다.");
    expect(
      toUserFacingErrorMessage(new Error("teacher_not_approved"), "AI 응답을 받지 못했습니다."),
    ).toBe("관리자 승인을 기다리는 계정입니다.");
  });

  it("keeps a Korean message the server already wrote for the user", () => {
    expect(
      toWorkspaceConnectionErrorMessage(new Error("요청을 처리하지 못했습니다.")),
    ).toBe("요청을 처리하지 못했습니다.");
  });

  it("falls back when the thrown value is not an error", () => {
    expect(toWorkspaceConnectionErrorMessage("boom")).toBe(
      "로컬 서버와 연결하지 못했습니다.",
    );
    expect(toWorkspaceConnectionErrorMessage(undefined)).toBe(
      "로컬 서버와 연결하지 못했습니다.",
    );
  });

  it("falls back on an empty or whitespace-only message", () => {
    expect(toWorkspaceConnectionErrorMessage(new Error(""))).toBe(
      "로컬 서버와 연결하지 못했습니다.",
    );
    expect(toWorkspaceConnectionErrorMessage(new Error("   "))).toBe(
      "로컬 서버와 연결하지 못했습니다.",
    );
  });

  it("ignores surrounding whitespace when matching an internal code", () => {
    expect(toWorkspaceConnectionErrorMessage(new Error("  auth_required  "))).toBe(
      "로그인이 필요합니다. 다시 로그인한 뒤 시도해 주세요.",
    );
  });
});
