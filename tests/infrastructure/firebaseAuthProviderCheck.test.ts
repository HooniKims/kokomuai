import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildFirebaseAuthProviderSetupActions,
  buildIdentityToolkitAdminUrls,
  createServiceAccountJwtAssertion,
  evaluateFirebaseAuthProviderConfig,
  evaluateFirebaseAuthProviderProbeResults,
  runFirebaseAuthProviderCheck
} from "../../scripts/checkFirebaseAuthProviders";

describe("firebase auth provider check", () => {
  it("passes only when email/password and Google sign-in providers are enabled", () => {
    expect(
      evaluateFirebaseAuthProviderConfig({
        projectConfig: {
          signIn: {
            email: {
              enabled: true,
              passwordRequired: true
            }
          }
        },
        googleProviderConfig: {
          enabled: true
        }
      })
    ).toEqual({
      ok: true,
      errors: [],
      providers: {
        emailPassword: "enabled",
        google: "enabled"
      }
    });
  });

  it("reports disabled providers with operator-focused messages", () => {
    const result = evaluateFirebaseAuthProviderConfig({
      projectConfig: {
        signIn: {
          email: {
            enabled: false,
            passwordRequired: false
          }
        }
      },
      googleProviderConfig: {
        enabled: false
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      "Firebase Authentication 이메일/비밀번호 제공자가 활성화되어 있지 않습니다.",
      "Firebase Authentication Google 제공자가 활성화되어 있지 않습니다."
    ]);
    expect(result.providers).toEqual({
      emailPassword: "disabled",
      google: "disabled"
    });
  });

  it("builds the Identity Toolkit Admin URLs from the Firebase project id", () => {
    expect(buildIdentityToolkitAdminUrls("kkokkomu-d6a4c")).toEqual({
      projectConfig: "https://identitytoolkit.googleapis.com/admin/v2/projects/kkokkomu-d6a4c/config",
      googleProviderConfig:
        "https://identitytoolkit.googleapis.com/admin/v2/projects/kkokkomu-d6a4c/defaultSupportedIdpConfigs/google.com"
    });
  });

  it("builds operator setup actions with the project-specific Firebase Auth console URL", () => {
    expect(buildFirebaseAuthProviderSetupActions("kkokkomu-d6a4c")).toEqual([
      "Firebase 콘솔에서 Authentication을 시작하고 이메일/비밀번호와 Google 제공자를 활성화합니다.",
      "Firebase Auth 제공자 설정: https://console.firebase.google.com/project/kkokkomu-d6a4c/authentication/providers",
      "설정 후 npm run firebase:auth:check를 다시 실행합니다."
    ]);
  });

  it("creates a short-lived service account JWT assertion for the OAuth token exchange", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const assertion = createServiceAccountJwtAssertion({
      clientEmail: "firebase-adminsdk@example.iam.gserviceaccount.com",
      privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
      nowSeconds: 1781300000
    });
    const [header, payload, signature] = assertion.split(".");

    expect(JSON.parse(Buffer.from(header, "base64url").toString("utf8"))).toEqual({
      alg: "RS256",
      typ: "JWT"
    });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))).toEqual({
      iss: "firebase-adminsdk@example.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1781300000,
      exp: 1781303600
    });
    expect(signature).toEqual(expect.any(String));
    expect(assertion).not.toContain("BEGIN PRIVATE KEY");
  });

  it("exchanges the service account JWT and verifies provider configs through the Admin API", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const requested: Array<{ url: string; authorization?: string }> = [];

    const result = await runFirebaseAuthProviderCheck({
      env: {
        FIREBASE_PROJECT_ID: "kkokkomu-d6a4c",
        FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
          client_email: "firebase-adminsdk@example.iam.gserviceaccount.com",
          private_key: privateKey.export({ format: "pem", type: "pkcs8" }).toString()
        })
      },
      nowSeconds: 1781300000,
      fetchImpl: async (url, init) => {
        requested.push({
          url: String(url),
          authorization: init?.headers instanceof Headers ? init.headers.get("Authorization") ?? undefined : undefined
        });
        if (String(url) === "https://oauth2.googleapis.com/token") {
          expect(init?.method).toBe("POST");
          expect(String(init?.body)).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
          return jsonResponse(200, { access_token: "ya29.test-token", token_type: "Bearer", expires_in: 3600 });
        }
        if (String(url).endsWith("/config")) {
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
          return jsonResponse(200, { enabled: true });
        }
        return jsonResponse(404, { error: { message: "not found" } });
      }
    });

    expect(result.ok).toBe(true);
    expect(requested.map((request) => request.url)).toEqual([
      "https://oauth2.googleapis.com/token",
      "https://identitytoolkit.googleapis.com/admin/v2/projects/kkokkomu-d6a4c/config",
      "https://identitytoolkit.googleapis.com/admin/v2/projects/kkokkomu-d6a4c/defaultSupportedIdpConfigs/google.com"
    ]);
    expect(requested.slice(1).map((request) => request.authorization)).toEqual([
      "Bearer ya29.test-token",
      "Bearer ya29.test-token"
    ]);
  });

  it("falls back to non-destructive Firebase Auth REST probes when Admin config is not initialized", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const requested: string[] = [];

    const result = await runFirebaseAuthProviderCheck({
      env: {
        FIREBASE_PROJECT_ID: "kkokkomu-d6a4c",
        VITE_FIREBASE_API_KEY: "client-key",
        FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
          client_email: "firebase-adminsdk@example.iam.gserviceaccount.com",
          private_key: privateKey.export({ format: "pem", type: "pkcs8" }).toString()
        })
      },
      nowSeconds: 1781300000,
      fetchImpl: async (url) => {
        requested.push(String(url));
        if (String(url) === "https://oauth2.googleapis.com/token") {
          return jsonResponse(200, { access_token: "ya29.test-token" });
        }
        if (String(url).endsWith("/config")) {
          return jsonResponse(404, { error: { message: "CONFIGURATION_NOT_FOUND" } });
        }
        if (String(url).includes("accounts:signInWithPassword")) {
          return jsonResponse(400, { error: { message: "EMAIL_NOT_FOUND" } });
        }
        if (String(url).includes("accounts:signInWithIdp")) {
          return jsonResponse(400, { error: { message: "INVALID_IDP_RESPONSE" } });
        }
        return jsonResponse(404, { error: { message: "not found" } });
      }
    });

    expect(result).toEqual({
      ok: true,
      errors: [],
      providers: {
        emailPassword: "enabled",
        google: "enabled"
      }
    });
    expect(requested).toContain("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=client-key");
    expect(requested).toContain("https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=client-key");
  });

  it("uses the public Firebase Auth probe directly when service account credentials are not present", async () => {
    const requested: string[] = [];

    const result = await runFirebaseAuthProviderCheck({
      env: {
        FIREBASE_PROJECT_ID: "kkokkomu-d6a4c",
        VITE_FIREBASE_API_KEY: "client-key"
      },
      nowSeconds: 1781300000,
      fetchImpl: async (url) => {
        requested.push(String(url));
        if (String(url).includes("accounts:signInWithPassword")) {
          return jsonResponse(400, { error: { message: "INVALID_LOGIN_CREDENTIALS" } });
        }
        if (String(url).includes("accounts:signInWithIdp")) {
          return jsonResponse(400, { error: { message: "INVALID_IDP_RESPONSE" } });
        }
        return jsonResponse(404, { error: { message: "not found" } });
      }
    });

    expect(result.ok).toBe(true);
    expect(requested).toEqual([
      "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=client-key",
      "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=client-key"
    ]);
  });

  it("treats a missing Google Admin provider config as a disabled Google provider", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

    const result = await runFirebaseAuthProviderCheck({
      env: {
        FIREBASE_PROJECT_ID: "kkokkomu-d6a4c",
        FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
          client_email: "firebase-adminsdk@example.iam.gserviceaccount.com",
          private_key: privateKey.export({ format: "pem", type: "pkcs8" }).toString()
        })
      },
      nowSeconds: 1781300000,
      fetchImpl: async (url) => {
        if (String(url) === "https://oauth2.googleapis.com/token") {
          return jsonResponse(200, { access_token: "ya29.test-token" });
        }
        if (String(url).endsWith("/config")) {
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
        return jsonResponse(404, { error: { message: "not found" } });
      }
    });

    expect(result).toEqual({
      ok: false,
      errors: ["Firebase Authentication Google 제공자가 활성화되어 있지 않습니다."],
      providers: {
        emailPassword: "enabled",
        google: "disabled"
      }
    });
  });

  it("maps Firebase Auth REST probe errors to provider states", () => {
    expect(
      evaluateFirebaseAuthProviderProbeResults({
        emailPasswordMessage: "OPERATION_NOT_ALLOWED",
        googleMessage: "INVALID_IDP_RESPONSE"
      })
    ).toEqual({
      ok: false,
      errors: ["Firebase Authentication 이메일/비밀번호 제공자가 활성화되어 있지 않습니다."],
      providers: {
        emailPassword: "disabled",
        google: "enabled"
      }
    });
  });

  it("reports an uninitialized Firebase Authentication project explicitly", () => {
    expect(
      evaluateFirebaseAuthProviderProbeResults({
        emailPasswordMessage: "CONFIGURATION_NOT_FOUND",
        googleMessage: "CONFIGURATION_NOT_FOUND"
      })
    ).toEqual({
      ok: false,
      errors: [
        "Firebase Authentication이 아직 초기화되어 있지 않습니다. Firebase 콘솔에서 Authentication을 시작하고 이메일/비밀번호와 Google 제공자를 활성화하세요."
      ],
      providers: {
        emailPassword: "unknown",
        google: "unknown"
      }
    });
  });
});

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
