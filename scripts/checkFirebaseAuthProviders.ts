import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnvText } from "./productionPreflight";

type EnvironmentSource = Record<string, string | undefined>;
type ProviderState = "enabled" | "disabled" | "unknown";

interface FirebaseAuthProviderCheckInput {
  env?: EnvironmentSource;
  fetchImpl?: typeof fetch;
  nowSeconds?: number;
}

interface FirebaseProjectConfig {
  signIn?: {
    email?: {
      enabled?: boolean;
      passwordRequired?: boolean;
    };
  };
}

interface DefaultSupportedIdpConfig {
  enabled?: boolean;
}

interface FirebaseAuthRestProbeResultInput {
  emailPasswordMessage: string;
  googleMessage: string;
}

interface ServiceAccountCredential {
  clientEmail: string;
  privateKey: string;
}

export interface FirebaseAuthProviderCheckResult {
  ok: boolean;
  errors: string[];
  providers: {
    emailPassword: ProviderState;
    google: ProviderState;
  };
}

export function buildIdentityToolkitAdminUrls(projectId: string): {
  projectConfig: string;
  googleProviderConfig: string;
} {
  const normalizedProjectId = projectId.trim();
  return {
    projectConfig: `https://identitytoolkit.googleapis.com/admin/v2/projects/${normalizedProjectId}/config`,
    googleProviderConfig: `https://identitytoolkit.googleapis.com/admin/v2/projects/${normalizedProjectId}/defaultSupportedIdpConfigs/google.com`
  };
}

export function buildFirebaseAuthProviderSetupActions(firebaseProjectId?: string): string[] {
  const normalizedProjectId = firebaseProjectId?.trim();
  const providerUrl = normalizedProjectId
    ? `https://console.firebase.google.com/project/${encodeURIComponent(normalizedProjectId)}/authentication/providers`
    : "https://console.firebase.google.com";

  return [
    "Firebase 콘솔에서 Authentication을 시작하고 이메일/비밀번호와 Google 제공자를 활성화합니다.",
    `Firebase Auth 제공자 설정: ${providerUrl}`,
    "설정 후 npm run firebase:auth:check를 다시 실행합니다."
  ];
}

export function evaluateFirebaseAuthProviderConfig(input: {
  projectConfig: FirebaseProjectConfig;
  googleProviderConfig: DefaultSupportedIdpConfig;
}): FirebaseAuthProviderCheckResult {
  const email = input.projectConfig.signIn?.email;
  const emailPasswordEnabled = email?.enabled === true && email.passwordRequired === true;
  const googleEnabled = input.googleProviderConfig.enabled === true;
  const errors: string[] = [];

  if (!emailPasswordEnabled) {
    errors.push("Firebase Authentication 이메일/비밀번호 제공자가 활성화되어 있지 않습니다.");
  }
  if (!googleEnabled) {
    errors.push("Firebase Authentication Google 제공자가 활성화되어 있지 않습니다.");
  }

  return {
    ok: errors.length === 0,
    errors,
    providers: {
      emailPassword: emailPasswordEnabled ? "enabled" : "disabled",
      google: googleEnabled ? "enabled" : "disabled"
    }
  };
}

export function evaluateFirebaseAuthProviderProbeResults(input: FirebaseAuthRestProbeResultInput): FirebaseAuthProviderCheckResult {
  const emailPassword = classifyEmailPasswordProbeMessage(input.emailPasswordMessage);
  const google = classifyGoogleProbeMessage(input.googleMessage);
  const errors: string[] = [];

  if (isConfigurationNotFoundMessage(input.emailPasswordMessage) && isConfigurationNotFoundMessage(input.googleMessage)) {
    return {
      ok: false,
      errors: [
        "Firebase Authentication이 아직 초기화되어 있지 않습니다. Firebase 콘솔에서 Authentication을 시작하고 이메일/비밀번호와 Google 제공자를 활성화하세요."
      ],
      providers: {
        emailPassword,
        google
      }
    };
  }

  if (emailPassword === "disabled") {
    errors.push("Firebase Authentication 이메일/비밀번호 제공자가 활성화되어 있지 않습니다.");
  } else if (emailPassword === "unknown") {
    errors.push(`Firebase Authentication 이메일/비밀번호 제공자 상태를 확인하지 못했습니다: ${sanitizeFirebaseErrorMessage(input.emailPasswordMessage)}`);
  }

  if (google === "disabled") {
    errors.push("Firebase Authentication Google 제공자가 활성화되어 있지 않습니다.");
  } else if (google === "unknown") {
    errors.push(`Firebase Authentication Google 제공자 상태를 확인하지 못했습니다: ${sanitizeFirebaseErrorMessage(input.googleMessage)}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    providers: {
      emailPassword,
      google
    }
  };
}

export function createServiceAccountJwtAssertion(input: ServiceAccountCredential & { nowSeconds?: number }): string {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  const payload = {
    iss: input.clientEmail,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSeconds,
    exp: nowSeconds + 3600
  };
  const signingInput = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(input.privateKey, "base64url");

  return `${signingInput}.${signature}`;
}

export async function runFirebaseAuthProviderCheck(input: FirebaseAuthProviderCheckInput = {}): Promise<FirebaseAuthProviderCheckResult> {
  const env = input.env ?? readCurrentEnv();
  const projectId = readRequired(env, "FIREBASE_PROJECT_ID");
  const fetchImpl = input.fetchImpl ?? fetch;

  if (!hasAdminCheckCredential(env)) {
    return runFirebaseAuthRestProviderProbe(env, fetchImpl, input.nowSeconds);
  }

  try {
    const accessToken = env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim() || (await requestServiceAccountAccessToken(env, fetchImpl, input.nowSeconds));
    const urls = buildIdentityToolkitAdminUrls(projectId);
    const projectConfig = await fetchJson<FirebaseProjectConfig>(fetchImpl, urls.projectConfig, accessToken, "Firebase Auth project config");
    let googleProviderConfig: DefaultSupportedIdpConfig;

    try {
      googleProviderConfig = await fetchJson<DefaultSupportedIdpConfig>(
        fetchImpl,
        urls.googleProviderConfig,
        accessToken,
        "Firebase Auth Google provider config"
      );
    } catch (error) {
      if (isMissingGoogleProviderConfig(error)) {
        googleProviderConfig = { enabled: false };
      } else {
        throw error;
      }
    }

    return evaluateFirebaseAuthProviderConfig({
      projectConfig,
      googleProviderConfig
    });
  } catch (error) {
    if (isConfigurationNotFound(error)) {
      return runFirebaseAuthRestProviderProbe(env, fetchImpl, input.nowSeconds);
    }
    throw error;
  }
}

async function requestServiceAccountAccessToken(env: EnvironmentSource, fetchImpl: typeof fetch, nowSeconds?: number): Promise<string> {
  const credential = readServiceAccountCredential(env);
  const assertion = createServiceAccountJwtAssertion({
    ...credential,
    nowSeconds
  });
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: new Headers({
      "Content-Type": "application/x-www-form-urlencoded"
    }),
    body: body.toString()
  });
  const payload = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };

  if (!response.ok || !payload.access_token) {
    throw new Error(`Google OAuth token exchange failed: ${response.status} ${payload.error_description ?? payload.error ?? "unknown error"}`);
  }

  return payload.access_token;
}

async function runFirebaseAuthRestProviderProbe(
  env: EnvironmentSource,
  fetchImpl: typeof fetch,
  nowSeconds?: number
): Promise<FirebaseAuthProviderCheckResult> {
  const apiKey = readRequired(env, "VITE_FIREBASE_API_KEY");
  const marker = String(nowSeconds ?? Math.floor(Date.now() / 1000));
  const emailPasswordMessage = await probeFirebaseAuthRestEndpoint(
    fetchImpl,
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      email: `kkokkomu-provider-check-${marker}@example.com`,
      password: `ProviderCheck-${marker}!`,
      returnSecureToken: true
    }
  );
  const googleMessage = await probeFirebaseAuthRestEndpoint(
    fetchImpl,
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(apiKey)}`,
    {
      postBody: new URLSearchParams({
        id_token: "kkokkomu-provider-check.invalid",
        providerId: "google.com"
      }).toString(),
      requestUri: "http://localhost",
      returnIdpCredential: true,
      returnSecureToken: true
    }
  );

  return evaluateFirebaseAuthProviderProbeResults({
    emailPasswordMessage,
    googleMessage
  });
}

async function probeFirebaseAuthRestEndpoint(fetchImpl: typeof fetch, url: string, payload: Record<string, unknown>): Promise<string> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: new Headers({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  });
  const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };

  if (response.ok) return "OK";
  return body.error?.message ?? `HTTP_${response.status}`;
}

async function fetchJson<T>(fetchImpl: typeof fetch, url: string, accessToken: string, label: string): Promise<T> {
  const response = await fetchImpl(url, {
    headers: new Headers({
      Authorization: `Bearer ${accessToken}`
    })
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };

  if (!response.ok) {
    throw new FirebaseAuthCheckHttpError(label, response.status, payload.error?.message ?? "unknown error");
  }

  return payload;
}

class FirebaseAuthCheckHttpError extends Error {
  constructor(
    readonly label: string,
    readonly status: number,
    readonly googleMessage: string
  ) {
    super(`${label} request failed: ${status} ${googleMessage}`);
  }
}

function isConfigurationNotFound(error: unknown): boolean {
  return error instanceof FirebaseAuthCheckHttpError && error.status === 404 && error.googleMessage.includes("CONFIGURATION_NOT_FOUND");
}

function isMissingGoogleProviderConfig(error: unknown): boolean {
  return error instanceof FirebaseAuthCheckHttpError && error.status === 404 && error.label === "Firebase Auth Google provider config";
}

function classifyEmailPasswordProbeMessage(message: string): ProviderState {
  const normalized = message.toUpperCase();
  if (normalized.includes("OPERATION_NOT_ALLOWED")) return "disabled";
  if (
    normalized.includes("EMAIL_NOT_FOUND") ||
    normalized.includes("INVALID_LOGIN_CREDENTIALS") ||
    normalized.includes("INVALID_PASSWORD") ||
    normalized.includes("USER_DISABLED") ||
    normalized === "OK"
  ) {
    return "enabled";
  }
  return "unknown";
}

function classifyGoogleProbeMessage(message: string): ProviderState {
  const normalized = message.toUpperCase();
  if (normalized.includes("OPERATION_NOT_ALLOWED")) return "disabled";
  if (
    normalized.includes("INVALID_IDP_RESPONSE") ||
    normalized.includes("INVALID_CREDENTIAL") ||
    normalized.includes("INVALID_ID_TOKEN") ||
    normalized === "OK"
  ) {
    return "enabled";
  }
  return "unknown";
}

function sanitizeFirebaseErrorMessage(message: string): string {
  return message.replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]");
}

function isConfigurationNotFoundMessage(message: string): boolean {
  return message.toUpperCase().includes("CONFIGURATION_NOT_FOUND");
}

function hasAdminCheckCredential(env: EnvironmentSource): boolean {
  return Boolean(
    env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim() ||
      env.FIREBASE_SERVICE_ACCOUNT?.trim() ||
      (env.FIREBASE_CLIENT_EMAIL?.trim() && env.FIREBASE_PRIVATE_KEY?.trim())
  );
}

function readServiceAccountCredential(env: EnvironmentSource): ServiceAccountCredential {
  const serviceAccount = env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (serviceAccount) {
    const decoded = serviceAccount.startsWith("{") ? serviceAccount : Buffer.from(serviceAccount, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as { client_email?: string; private_key?: string };
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT must include client_email and private_key");
    }
    return {
      clientEmail: parsed.client_email,
      privateKey: normalizePrivateKey(parsed.private_key)
    };
  }

  return {
    clientEmail: readRequired(env, "FIREBASE_CLIENT_EMAIL"),
    privateKey: normalizePrivateKey(readRequired(env, "FIREBASE_PRIVATE_KEY"))
  };
}

function base64UrlEncodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n");
}

function readRequired(env: EnvironmentSource, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name}이 필요합니다.`);
  return value;
}

function readCurrentEnv(): EnvironmentSource {
  const envPath = join(process.cwd(), ".env");
  const localEnv = existsSync(envPath) ? parseEnvText(readFileSync(envPath, "utf8")) : {};
  return {
    ...localEnv,
    ...process.env
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runFirebaseAuthProviderCheck()
    .then((result) => {
      for (const error of result.errors) {
        console.error(`ERROR ${error}`);
      }
      if (!result.ok) {
        const env = readCurrentEnv();
        for (const action of buildFirebaseAuthProviderSetupActions(env.FIREBASE_PROJECT_ID)) {
          console.error(`ACTION ${action}`);
        }
      }
      console.log(
        JSON.stringify(
          {
            ok: result.ok,
            providers: result.providers
          },
          null,
          2
        )
      );
      process.exit(result.ok ? 0 : 1);
    })
    .catch((error) => {
      console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
