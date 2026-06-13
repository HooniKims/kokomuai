import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("firestore rules", () => {
  it("denies direct client access to server-managed collections by default", async () => {
    const rules = await readFile("firestore.rules", "utf8");

    expect(rules).toContain("match /{document=**}");
    expect(rules).toContain("allow read, write: if false;");
    expect(rules).not.toContain("allow write: if true");
  });
});
