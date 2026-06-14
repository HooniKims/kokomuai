import { describe, expect, it } from "vitest";
import { shouldKeepAuthWaitingOverlay } from "../../src/presentation/auth/authLoadingState";

describe("auth loading state", () => {
  it("keeps the waiting overlay visible while the signed-in workspace is loading", () => {
    expect(
      shouldKeepAuthWaitingOverlay({
        isSubmittingAuth: false,
        isResolvingAuthSession: true
      })
    ).toBe(true);
  });

  it("shows the waiting overlay during the initial auth submission", () => {
    expect(
      shouldKeepAuthWaitingOverlay({
        isSubmittingAuth: true,
        isResolvingAuthSession: false
      })
    ).toBe(true);
  });

  it("hides the waiting overlay after auth and workspace loading are both complete", () => {
    expect(
      shouldKeepAuthWaitingOverlay({
        isSubmittingAuth: false,
        isResolvingAuthSession: false
      })
    ).toBe(false);
  });
});
