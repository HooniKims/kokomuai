import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync("src/presentation/styles.css", "utf8");

describe("auth layout styles", () => {
  it("keeps the login email and password fields spanning the full action row", () => {
    const baseFormGridIndex = stylesheet.indexOf(".form-grid {");
    const authFormGridIndex = stylesheet.indexOf(".form-grid.auth-form-grid");

    expect(baseFormGridIndex).toBeGreaterThanOrEqual(0);
    expect(authFormGridIndex).toBeGreaterThan(baseFormGridIndex);
    expect(stylesheet).toMatch(
      /\.form-grid\.auth-form-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s,
    );
    expect(stylesheet).toMatch(
      /\.form-grid\.login-form-grid\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;/s,
    );
  });

  it("sizes all three login action buttons equally without a signup offset", () => {
    expect(stylesheet).toMatch(
      /\.auth-workspace-login\s+\.auth-actions\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(150px,\s*1fr\)\);/s,
    );
    expect(stylesheet).toMatch(
      /\.auth-workspace-login\s+\.auth-actions\s+\.pill\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*justify-content:\s*center;[^}]*min-height:\s*48px;/s,
    );
    expect(stylesheet).toMatch(
      /\.auth-workspace-login\s+\.auth-mode-link\s*\{[^}]*margin-top:\s*0;/s,
    );
  });

  it("keeps the login panel vertically compact for short login content", () => {
    expect(stylesheet).toMatch(
      /\.auth-workspace-login\s+\.auth-panel\s*\{[^}]*min-height:\s*auto;[^}]*padding:\s*clamp\(22px,\s*3vw,\s*32px\);/s,
    );
    expect(stylesheet).toMatch(
      /\.auth-workspace-login\s+\.section-heading\s*\{[^}]*margin-bottom:\s*16px;/s,
    );
  });

  it("lets the login panel use available width without overflowing narrowed desktop windows", () => {
    expect(stylesheet).toMatch(
      /\.auth-workspace-login\s*\{[^}]*max-width:\s*min\(860px,\s*calc\(100vw - 40px\)\);[^}]*grid-template-columns:\s*minmax\(0,\s*min\(780px,\s*100%\)\);/s,
    );
    expect(stylesheet).toMatch(
      /\.auth-workspace-login\s+\.auth-actions\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(150px,\s*1fr\)\);/s,
    );
  });

  it("preserves the single-column login workspace inside the narrowed desktop media query", () => {
    expect(stylesheet).toMatch(
      /@media\s*\(max-width:\s*1180px\)\s*\{[\s\S]*?\.workspace\s*\{[^}]*grid-template-columns:\s*minmax\(220px,\s*260px\)\s*minmax\(0,\s*1fr\);[^}]*\}[\s\S]*?\.auth-workspace-login\s*\{[^}]*max-width:\s*min\(860px,\s*calc\(100vw - 40px\)\);[^}]*grid-template-columns:\s*minmax\(0,\s*min\(780px,\s*100%\)\);/s,
    );
  });
});
