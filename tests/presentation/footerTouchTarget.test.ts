import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync("src/presentation/styles.css", "utf8");

describe("footer touch targets", () => {
  it("keeps footer links large enough to tap on mobile and tablet", () => {
    expect(stylesheet).toMatch(/\.app-footer-links\s+a\s*\{[^}]*min-height:\s*44px;/s);
    expect(stylesheet).toMatch(/\.app-footer-links\s+a\s*\{[^}]*display:\s*inline-flex;/s);
    expect(stylesheet).toMatch(/\.app-footer-links\s+a\s*\{[^}]*align-items:\s*center;/s);
  });

  it("centers legal links above the privacy manager line", () => {
    expect(stylesheet).toMatch(/\.app-footer\s*\{[^}]*flex-direction:\s*column;/s);
    expect(stylesheet).toMatch(/\.app-footer\s*\{[^}]*align-items:\s*center;/s);
    expect(stylesheet).toMatch(/\.app-footer\s*\{[^}]*text-align:\s*center;/s);
    expect(stylesheet).toMatch(/\.app-footer-links\s*\{[^}]*justify-content:\s*center;/s);
  });
});
