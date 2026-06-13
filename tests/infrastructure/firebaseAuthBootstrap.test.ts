import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runFirebaseAuthBootstrap } from "../../scripts/bootstrapFirebaseAuth";

describe("firebase auth bootstrap", () => {
  it("initializes Firebase Authentication and enables email/password plus Google provider", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const requested: Array<{ url: string; method?: string; body?: unknown }> = [];

    const result = await runFirebaseAuthBootstrap({
      env: envWithServiceAccount(privateKey.export({ format: "pem", type: "pkcs8" }).toString()),
      nowSeconds: 1781300000,
      fetchImpl: async (url, init) => {
        requested.push({
          url: String(url),
          method: init?.method,
          body: typeof init?.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init?.body
        });
        if (String(url) === "https://oauth2.googleapis.com/token") {
          return jsonResponse(200, { access_token: "ya29.test-token" });
        }
        if (String(url).endsWith("/identityPlatform:initializeAuth")) {
          return jsonResponse(200, {});
        }
        if (String(url).includes("/config?updateMask=signIn.email")) {
          return jsonResponse(200, {
            signIn: {
              email: {
                enabled: true,
                passwordRequired: true
              }
            }
          });
        }
        if (String(url).endsWith("/defaultSupportedIdpConfigs/google.com")) {
          return jsonResponse(404, { error: { message: "NOT_FOUND" } });
        }
        if (String(url).includes("/defaultSupportedIdpConfigs?idpId=google.com")) {
          return jsonResponse(200, {
            name: "projects/kkokkomu-d6a4c/defaultSupportedIdpConfigs/google.com",
            enabled: true
          });
        }
        return jsonResponse(404, { error: { message: "not found" } });
      }
    });

    expect(result).toEqual({
      ok: true,
      errors: [],
      steps: {
        initializeAuth: "initialized",
        emailPassword: "enabled",
        google: "enabled"
      }
    });
    expect(requested.map((request) => `${request.method ?? "GET"} ${request.url}`)).toEqual([
      "POST https://oauth2.googleapis.com/token",
      "POST https://identitytoolkit.googleapis.com/v2/projects/kkokkomu-d6a4c/identityPlatform:initializeAuth",
      "PATCH https://identitytoolkit.googleapis.com/admin/v2/projects/kkokkomu-d6a4c/config?updateMask=signIn.email",
      "GET https://identitytoolkit.googleapis.com/admin/v2/projects/kkokkomu-d6a4c/defaultSupportedIdpConfigs/google.com",
      "POST https://identitytoolkit.googleapis.com/admin/v2/projects/kkokkomu-d6a4c/defaultSupportedIdpConfigs?idpId=google.com"
    ]);
    expect(requested[2].body).toEqual({
      name: "projects/kkokkomu-d6a4c/config",
      signIn: {
        email: {
          enabled: true,
          passwordRequired: true
        }
      }
    });
  });

  it("is idempotent when Auth is already initialized and Google exists but is disabled", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

    const result = await runFirebaseAuthBootstrap({
      env: envWithServiceAccount(privateKey.export({ format: "pem", type: "pkcs8" }).toString()),
      nowSeconds: 1781300000,
      fetchImpl: async (url) => {
        if (String(url) === "https://oauth2.googleapis.com/token") {
          return jsonResponse(200, { access_token: "ya29.test-token" });
        }
        if (String(url).endsWith("/identityPlatform:initializeAuth")) {
          return jsonResponse(409, { error: { message: "ALREADY_EXISTS" } });
        }
        if (String(url).includes("/config?updateMask=signIn.email")) {
          return jsonResponse(200, {});
        }
        if (String(url).endsWith("/defaultSupportedIdpConfigs/google.com")) {
          return jsonResponse(200, {
            name: "projects/kkokkomu-d6a4c/defaultSupportedIdpConfigs/google.com",
            enabled: false
          });
        }
        if (String(url).includes("/defaultSupportedIdpConfigs/google.com?updateMask=enabled")) {
          return jsonResponse(200, {
            name: "projects/kkokkomu-d6a4c/defaultSupportedIdpConfigs/google.com",
            enabled: true
          });
        }
        return jsonResponse(404, { error: { message: "not found" } });
      }
    });

    expect(result).toEqual({
      ok: true,
      errors: [],
      steps: {
        initializeAuth: "already_initialized",
        emailPassword: "enabled",
        google: "enabled"
      }
    });
  });

  it("reports Google provider bootstrap errors without exposing secrets", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

    const result = await runFirebaseAuthBootstrap({
      env: envWithServiceAccount(privateKey.export({ format: "pem", type: "pkcs8" }).toString()),
      nowSeconds: 1781300000,
      fetchImpl: async (url) => {
        if (String(url) === "https://oauth2.googleapis.com/token") {
          return jsonResponse(200, { access_token: "ya29.test-token" });
        }
        if (String(url).endsWith("/identityPlatform:initializeAuth")) {
          return jsonResponse(200, {});
        }
        if (String(url).includes("/config?updateMask=signIn.email")) {
          return jsonResponse(200, {});
        }
        if (String(url).endsWith("/defaultSupportedIdpConfigs/google.com")) {
          return jsonResponse(404, { error: { message: "NOT_FOUND" } });
        }
        if (String(url).includes("/defaultSupportedIdpConfigs?idpId=google.com")) {
          return jsonResponse(400, { error: { message: "CLIENT_ID_REQUIRED" } });
        }
        return jsonResponse(404, { error: { message: "not found" } });
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(["Firebase Authentication Google 제공자 활성화 실패: 400 CLIENT_ID_REQUIRED"]);
    expect(JSON.stringify(result)).not.toContain("BEGIN PRIVATE KEY");
    expect(JSON.stringify(result)).not.toContain("ya29.test-token");
  });

  it("stops provider updates when Identity Platform initialization is blocked by billing", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const requested: string[] = [];

    const result = await runFirebaseAuthBootstrap({
      env: envWithServiceAccount(privateKey.export({ format: "pem", type: "pkcs8" }).toString()),
      nowSeconds: 1781300000,
      fetchImpl: async (url) => {
        requested.push(String(url));
        if (String(url) === "https://oauth2.googleapis.com/token") {
          return jsonResponse(200, { access_token: "ya29.test-token" });
        }
        if (String(url).endsWith("/identityPlatform:initializeAuth")) {
          return jsonResponse(400, { error: { message: "BILLING_NOT_ENABLED : Identity Platform feature requires billing to be enabled." } });
        }
        return jsonResponse(500, { error: { message: "unexpected downstream call" } });
      }
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        "Firebase Authentication 자동 초기화는 현재 프로젝트에서 결제 활성화가 필요합니다. 무료 Firebase Auth를 유지하려면 Firebase 콘솔에서 Authentication을 시작하고 제공자를 활성화하세요."
      ],
      steps: {
        initializeAuth: "failed",
        emailPassword: "failed",
        google: "failed"
      }
    });
    expect(requested).toEqual([
      "https://oauth2.googleapis.com/token",
      "https://identitytoolkit.googleapis.com/v2/projects/kkokkomu-d6a4c/identityPlatform:initializeAuth"
    ]);
  });
});

function envWithServiceAccount(privateKey: string) {
  return {
    FIREBASE_PROJECT_ID: "kkokkomu-d6a4c",
    FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
      client_email: "firebase-adminsdk@example.iam.gserviceaccount.com",
      private_key: privateKey
    })
  };
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
