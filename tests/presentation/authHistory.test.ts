import { describe, expect, it } from "vitest";
import {
  createAuthModeHistoryState,
  readAuthModeFromHistoryState,
} from "../../src/presentation/App";

describe("auth mode history state", () => {
  it("reads only supported auth modes from browser history state", () => {
    expect(readAuthModeFromHistoryState({ authMode: "signup" })).toBe("signup");
    expect(readAuthModeFromHistoryState({ authMode: "login" })).toBe("login");
    expect(readAuthModeFromHistoryState({ authMode: "unknown" })).toBeNull();
    expect(readAuthModeFromHistoryState(null)).toBeNull();
  });

  it("preserves existing history state while recording the auth mode", () => {
    expect(createAuthModeHistoryState({ scroll: 20 }, "signup")).toEqual({
      scroll: 20,
      authMode: "signup",
    });
    expect(createAuthModeHistoryState(null, "login")).toEqual({
      authMode: "login",
    });
  });
});
