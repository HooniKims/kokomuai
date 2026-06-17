import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync("src/presentation/styles.css", "utf8");

describe("student workspace responsive layout styles", () => {
  it("keeps Korean notice copy from breaking awkwardly", () => {
    expect(stylesheet).toMatch(/\.student-workspace\s+\.notice\s+p\s*\{[^}]*word-break:\s*keep-all;/s);
    expect(stylesheet).toMatch(/\.student-workspace\s+\.notice\s+p\s*\{[^}]*text-wrap:\s*pretty;/s);
  });

  it("gives desktop student chat a wider platform-like canvas", () => {
    expect(stylesheet).toContain("@media (min-width: 1280px)");
    expect(stylesheet).toMatch(/\.student-workspace\s*\{[^}]*max-width:\s*min\(1520px,\s*calc\(100vw - 72px\)\);/s);
    expect(stylesheet).toMatch(/\.student-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(180px,\s*220px\)\s+minmax\(760px,\s*1fr\);/s);
  });

  it("raises the student workspace closer to the hero on larger screens", () => {
    expect(stylesheet).toMatch(/\.student-workspace\s*\{[^}]*margin-top:\s*clamp\(8px,\s*1\.4vw,\s*22px\);/s);
  });

  it("shows a taller chat history on desktop, tablet, and mobile", () => {
    expect(stylesheet).toMatch(/\.chat-card\s*\{[^}]*height:\s*clamp\(500px,\s*68vh,\s*680px\);/s);
    expect(stylesheet).toMatch(/\.student-workspace\s+\.chat-card\s*\{[^}]*height:\s*clamp\(620px,\s*calc\(100vh - 246px\),\s*820px\);/s);
    expect(stylesheet).toMatch(/@media \(max-width:\s*920px\)[\s\S]*\.chat-card\s*\{[^}]*height:\s*clamp\(560px,\s*74vh,\s*700px\);/s);
    expect(stylesheet).toMatch(/@media \(max-width:\s*560px\)[\s\S]*\.chat-card\s*\{[^}]*height:\s*clamp\(540px,\s*78vh,\s*680px\);/s);
  });
});
