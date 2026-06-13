import { describe, expect, it, vi } from "vitest";
import { scrollChatViewToBottom, scrollMessageListToBottom } from "../../src/presentation/routes/StudentChatRoute";

describe("chat auto scroll", () => {
  it("moves the message list to the bottom when new chat content appears", () => {
    const container = {
      scrollHeight: 1280,
      scrollTop: 0
    };

    scrollMessageListToBottom(container);

    expect(container.scrollTop).toBe(1280);
  });

  it("does nothing before the message list exists", () => {
    expect(() => scrollMessageListToBottom(null)).not.toThrow();
  });

  it("keeps the page position stable so the chat input stays visible", () => {
    const container = {
      scrollHeight: 1280,
      scrollTop: 0
    };
    const latestMessage = {
      scrollIntoView: vi.fn()
    };

    scrollChatViewToBottom(container, latestMessage);

    expect(container.scrollTop).toBe(1280);
    expect(latestMessage.scrollIntoView).not.toHaveBeenCalled();
  });
});
