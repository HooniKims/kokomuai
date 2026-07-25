import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("package manifest", () => {
  it("serves the e2e scripts a dev server with the Firebase auth gate off", () => {
    // The local e2e scripts drive the unauthenticated local-dev bootstrap, which
    // App.tsx only runs when Firebase teacher auth is disabled. Without this
    // override they stall at the login screen, which is how they went unrunnable
    // once .env turned the gate on.
    const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const scripts = manifest.scripts ?? {};

    expect(scripts["dev:e2e"]).toContain("VITE_FIREBASE_AUTH_ENABLED=false");
    expect(scripts["dev:full:e2e"]).toContain("npm:dev:e2e");
    expect(scripts["test:e2e:local"]).toContain("tests/e2e/localFullFlow.mjs");
    expect(scripts["test:e2e:qr"]).toContain("tests/e2e/shareQrDownload.mjs");
  });

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
