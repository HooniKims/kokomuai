import { describe, expect, it } from "vitest";
import { shouldPersistConversation } from "../../src/presentation/conversationPersistence";

describe("conversationPersistence", () => {
  it("does not overwrite stored messages before the initial load finishes", () => {
    expect(shouldPersistConversation({ hasLoadedConversation: false, loadedScope: "chatbot-1", currentScope: "chatbot-1" })).toBe(false);
    expect(shouldPersistConversation({ hasLoadedConversation: true, loadedScope: "chatbot-1", currentScope: "chatbot-1" })).toBe(true);
  });

  it("does not persist stale messages into a newly opened chatbot scope", () => {
    expect(shouldPersistConversation({ hasLoadedConversation: true, loadedScope: "chatbot-1", currentScope: "chatbot-2" })).toBe(false);
  });
});
