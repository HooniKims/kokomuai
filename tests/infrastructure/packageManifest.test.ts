import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("package manifest", () => {
  it("keeps Vite build tooling out of production runtime dependencies", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(manifest.dependencies).not.toHaveProperty("vite");
    expect(manifest.dependencies).not.toHaveProperty("@vitejs/plugin-react");
    expect(manifest.devDependencies).toHaveProperty("vite");
    expect(manifest.devDependencies).toHaveProperty("@vitejs/plugin-react");
  });
});
