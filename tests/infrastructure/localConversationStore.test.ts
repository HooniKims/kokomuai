import { describe, expect, it } from "vitest";
import { createConversationStorageKey } from "../../src/infrastructure/storage/localConversationStore";

describe("localConversationStore", () => {
  it("keeps student conversations separate for each chatbot", () => {
    expect(createConversationStorageKey("math-chatbot")).not.toBe(
      createConversationStorageKey("korean-chatbot")
    );
    expect(createConversationStorageKey("math-chatbot")).toContain("math-chatbot");
  });
});
