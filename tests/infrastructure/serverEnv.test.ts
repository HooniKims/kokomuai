import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadDotEnvFile, parseDotEnvText } from "../../server/serverEnv";

describe("serverEnv", () => {
  it("parses dotenv text without exposing or dropping JSON-like values", () => {
    const env = parseDotEnvText(`
# local secrets
OPENAI_API_KEY = openai-secret
LMSTUDIO_API_KEY="local-key"
FIREBASE_SERVICE_ACCOUNT={"client_email":"firebase@example.com","private_key":"line1\\nline2"}
EMPTY_VALUE=
`);

    expect(env).toMatchObject({
      OPENAI_API_KEY: "openai-secret",
      LMSTUDIO_API_KEY: "local-key",
      FIREBASE_SERVICE_ACCOUNT: '{"client_email":"firebase@example.com","private_key":"line1\\nline2"}',
      EMPTY_VALUE: ""
    });
  });

  it("loads .env values before starting the local API server while preserving explicit process env", () => {
    const directory = join(tmpdir(), `kkokkomu-env-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(directory, { recursive: true });
    const envPath = join(directory, ".env");
    writeFileSync(envPath, "OPENAI_API_KEY=file-secret\nNEIS_API_KEY=file-neis\n", "utf8");
    const targetEnv: Record<string, string | undefined> = {
      OPENAI_API_KEY: "process-secret"
    };

    try {
      const loaded = loadDotEnvFile(envPath, targetEnv);

      expect(loaded).toEqual(["NEIS_API_KEY"]);
      expect(targetEnv.OPENAI_API_KEY).toBe("process-secret");
      expect(targetEnv.NEIS_API_KEY).toBe("file-neis");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
