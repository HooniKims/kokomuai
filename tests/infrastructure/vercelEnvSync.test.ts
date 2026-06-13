import { describe, expect, it } from "vitest";
import {
  buildVercelEnvAddCommand,
  buildVercelEnvSyncPlan,
  maskVercelEnvPlan,
  parseVercelTargets
} from "../../scripts/syncVercelEnv";

describe("Vercel environment sync plan", () => {
  it("collects production runtime variables without syncing Vercel control credentials", () => {
    const plan = buildVercelEnvSyncPlan({
      OPENAI_API_KEY: "openai",
      NEIS_API_KEY: "neis",
      FIREBASE_PROJECT_ID: "kkokkomu-d6a4c",
      FIREBASE_SERVICE_ACCOUNT: "{\"client_email\":\"firebase@example.com\",\"private_key\":\"secret\"}",
      KKOKKOMU_ADMIN_EMAILS: "admin@example.com",
      LMSTUDIO_API_URL: "https://lm.example.test",
      LMSTUDIO_API_KEY: "lm-key",
      LMSTUDIO_GEMMA_E4B_MODEL: "google/gemma-4-e4b",
      LMSTUDIO_GEMMA_E2B_MODEL: "google/gemma-4-e2b",
      LMSTUDIO_GEMMA_12B_MODEL: "gemma-4-12b-it",
      LMSTUDIO_GEMMA_26B_MODEL: "gemma-4-26b-a4b-it",
      VITE_FIREBASE_AUTH_ENABLED: "true",
      VITE_FIREBASE_API_KEY: "client",
      VITE_FIREBASE_AUTH_DOMAIN: "kkokkomu-d6a4c.firebaseapp.com",
      VITE_FIREBASE_PROJECT_ID: "kkokkomu-d6a4c",
      VITE_FIREBASE_APP_ID: "app",
      VITE_FIREBASE_STORAGE_BUCKET: "kkokkomu-d6a4c.firebasestorage.app",
      VITE_FIREBASE_MESSAGING_SENDER_ID: "965823913795",
      VERCEL_TOKEN: "local-control-token",
      VERCEL_PROJECT_ID: "project"
    });

    expect(plan.every((entry) => entry.ready)).toBe(true);
    expect(plan.map((entry) => entry.name)).toEqual(
      expect.arrayContaining([
        "OPENAI_API_KEY",
        "NEIS_API_KEY",
        "FIREBASE_SERVICE_ACCOUNT",
        "KKOKKOMU_ADMIN_EMAILS",
        "LMSTUDIO_API_KEY",
        "VITE_FIREBASE_API_KEY"
      ])
    );
    expect(plan.map((entry) => entry.name)).not.toContain("VERCEL_TOKEN");
    expect(plan.map((entry) => entry.name)).not.toContain("VERCEL_PROJECT_ID");
  });

  it("falls back to split Firebase Admin credentials when no service account JSON is present", () => {
    const plan = buildVercelEnvSyncPlan({
      FIREBASE_CLIENT_EMAIL: "firebase@example.com",
      FIREBASE_PRIVATE_KEY: "private-key"
    });

    expect(plan.map((entry) => entry.name)).toEqual(expect.arrayContaining(["FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]));
    expect(plan.map((entry) => entry.name)).not.toContain("FIREBASE_SERVICE_ACCOUNT");
  });

  it("masks secret values in dry-run output", () => {
    const plan = buildVercelEnvSyncPlan({
      OPENAI_API_KEY: "secret-openai"
    });

    expect(maskVercelEnvPlan(plan).find((entry) => entry.name === "OPENAI_API_KEY")).toEqual({
      name: "OPENAI_API_KEY",
      required: true,
      ready: true,
      length: "secret-openai".length
    });
    expect(JSON.stringify(maskVercelEnvPlan(plan))).not.toContain("secret-openai");
  });

  it("parses one or more Vercel target environments", () => {
    expect(parseVercelTargets(undefined)).toEqual(["production"]);
    expect(parseVercelTargets("production,preview")).toEqual(["production", "preview"]);
    expect(() => parseVercelTargets("staging")).toThrow("지원하지 않는 Vercel 환경입니다: staging");
  });

  it("uses non-interactive Vercel CLI args without placing secret values in argv", () => {
    const command = buildVercelEnvAddCommand(
      {
        name: "OPENAI_API_KEY"
      },
      "production"
    );

    expect(command.args).toEqual(["vercel", "env", "add", "OPENAI_API_KEY", "production", "--force", "--yes", "--non-interactive"]);
    expect(command.args.join(" ")).not.toContain("secret-openai");
  });
});
