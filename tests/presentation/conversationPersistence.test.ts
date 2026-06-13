import { describe, expect, it } from "vitest";
import { shouldPersistConversation } from "../../src/presentation/conversationPersistence";

describe("conversationPersistence", () => {
  it("does not overwrite stored messages before the initial load finishes", () => {
    expect(shouldPersistConversation(false)).toBe(false);
    expect(shouldPersistConversation(true)).toBe(true);
  });
});
