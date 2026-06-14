import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createVercelApiHandler, describeTokenVerificationError } from "../../server/vercelApi";
import { createLocalStore } from "../../server/localStore";

const tempRoots: string[] = [];
const openServers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map(closeServer));
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("vercelApi", () => {
  it("logs Firebase token verification failures without leaking tokens or private keys", () => {
    const message = describeTokenVerificationError({
      code: "auth/argument-error",
      message: "Decoding Firebase ID token failed. token=secret-token private_key=secret-key",
    });

    expect(message).toContain("auth/argument-error");
    expect(message).toContain("Decoding Firebase ID token failed.");
    expect(message).not.toContain("secret-token");
    expect(message).not.toContain("secret-key");
  });

  it("builds a Vercel-compatible API handler with injected store dependencies", async () => {
    const root = await mkdtemp(join(tmpdir(), "vercel-api-"));
    tempRoots.push(root);
    const handler = await createVercelApiHandler({
      store: createLocalStore(join(root, "store.json")),
      schoolSearch: async () => [],
      env: {
        LMSTUDIO_API_KEY: "local-secret"
      }
    });
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    openServers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      provider: "lmstudio",
      model: "gemma-4-12b-it"
    });
  });
});

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
