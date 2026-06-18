import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync("src/presentation/styles.css", "utf8");

describe("footer touch targets", () => {
  it("keeps footer links large enough to tap on mobile and tablet", () => {
    expect(stylesheet).toMatch(/\.app-footer\s+a\s*\{[^}]*min-height:\s*44px;/s);
    expect(stylesheet).toMatch(/\.app-footer\s+a\s*\{[^}]*display:\s*inline-flex;/s);
    expect(stylesheet).toMatch(/\.app-footer\s+a\s*\{[^}]*align-items:\s*center;/s);
  });
});
