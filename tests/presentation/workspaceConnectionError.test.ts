import { describe, expect, it } from "vitest";
import { toWorkspaceConnectionErrorMessage } from "../../src/presentation/workspaceConnectionError";

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

  it("hides an English browser error behind the connection fallback", () => {
    // What a teacher sees today when the local API is not running.
    expect(toWorkspaceConnectionErrorMessage(new Error("Failed to fetch"))).toBe(
      "로컬 서버와 연결하지 못했습니다.",
    );
    expect(
      toWorkspaceConnectionErrorMessage(new Error("NetworkError when attempting to fetch resource.")),
    ).toBe("로컬 서버와 연결하지 못했습니다.");
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
