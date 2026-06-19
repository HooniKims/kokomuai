import { describe, expect, it } from "vitest";
import { shouldSubmitChatInputOnKeyDown } from "../../src/presentation/routes/StudentChatRoute";

describe("student chat input submit behavior", () => {
  it("does not submit Enter while a Korean IME composition is still active", () => {
    expect(
      shouldSubmitChatInputOnKeyDown({
        key: "Enter",
        shiftKey: false,
        isComposing: true,
        keyCode: 229,
      }),
    ).toBe(false);
  });

  it("submits plain Enter and keeps Shift+Enter for line breaks", () => {
    expect(
      shouldSubmitChatInputOnKeyDown({
        key: "Enter",
        shiftKey: false,
        isComposing: false,
        keyCode: 13,
      }),
    ).toBe(true);
    expect(
      shouldSubmitChatInputOnKeyDown({
        key: "Enter",
        shiftKey: true,
        isComposing: false,
        keyCode: 13,
      }),
    ).toBe(false);
  });
});
