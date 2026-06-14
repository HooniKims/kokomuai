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
      /\.auth-workspace-login\s+\.auth-actions\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/s,
    );
    expect(stylesheet).toMatch(
      /\.auth-workspace-login\s+\.auth-actions\s+\.pill\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*justify-content:\s*center;[^}]*min-height:\s*48px;/s,
    );
    expect(stylesheet).toMatch(
      /\.auth-workspace-login\s+\.auth-mode-link\s*\{[^}]*margin-top:\s*0;/s,
    );
  });
});
