import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServiceAccountJwtAssertion } from "./checkFirebaseAuthProviders";
import { parseEnvText } from "./productionPreflight";

type EnvironmentSource = Record<string, string | undefined>;
type InitializeAuthState = "initialized" | "already_initialized";
type ProviderBootstrapState = "enabled" | "failed";

interface FirebaseAuthBootstrapInput {
  env?: EnvironmentSource;
  fetchImpl?: typeof fetch;
  nowSeconds?: number;
}

interface ServiceAccountCredential {
  clientEmail: string;
  privateKey: string;
}

interface GoogleProviderConfig {
  name?: string;
  enabled?: boolean;
}

interface ApiResult<T> {
  ok: boolean;
  status: number;
  payload: T;
  message: string;
}

export interface FirebaseAuthBootstrapResult {
  ok: boolean;
  errors: string[];
  steps: {
    initializeAuth: InitializeAuthState | "failed";
    emailPassword: ProviderBootstrapState;
    google: ProviderBootstrapState;
  };
}

export async function runFirebaseAuthBootstrap(input: FirebaseAuthBootstrapInput = {}): Promise<FirebaseAuthBootstrapResult> {
  const env = input.env ?? readCurrentEnv();
  const projectId = readRequired(env, "FIREBASE_PROJECT_ID");
  const fetchImpl = input.fetchImpl ?? fetch;
  const accessToken = await requestServiceAccountAccessToken(env, fetchImpl, input.nowSeconds);
  const steps: FirebaseAuthBootstrapResult["steps"] = {
    initializeAuth: "failed",
    emailPassword: "failed",
    google: "failed"
  };
  const errors: string[] = [];

  const initialize = await initializeFirebaseAuth(projectId, accessToken, fetchImpl);
  if (initialize.ok) {
    steps.initializeAuth = initialize.message.includes("ALREADY_EXISTS") ? "already_initialized" : "initialized";
  } else if (initialize.status === 409 || initialize.message.includes("ALREADY_EXISTS")) {
    steps.initializeAuth = "already_initialized";
  } else if (initialize.message.includes("BILLING_NOT_ENABLED")) {
    return {
      ok: false,
      errors: [
        "Firebase Authentication 자동 초기화는 현재 프로젝트에서 결제 활성화가 필요합니다. 무료 Firebase Auth를 유지하려면 Firebase 콘솔에서 Authentication을 시작하고 제공자를 활성화하세요."
      ],
      steps
    };
  } else {
    errors.push(`Firebase Authentication 초기화 실패: ${initialize.status} ${sanitizeErrorMessage(initialize.message)}`);
  }

  const email = await enableEmailPasswordProvider(projectId, accessToken, fetchImpl);
  if (email.ok) {
    steps.emailPassword = "enabled";
  } else {
    errors.push(`Firebase Authentication 이메일/비밀번호 제공자 활성화 실패: ${email.status} ${sanitizeErrorMessage(email.message)}`);
  }

  const google = await enableGoogleProvider(projectId, accessToken, fetchImpl);
  if (google.ok) {
    steps.google = "enabled";
  } else {
    errors.push(`Firebase Authentication Google 제공자 활성화 실패: ${google.status} ${sanitizeErrorMessage(google.message)}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    steps
  };
}

async function initializeFirebaseAuth(projectId: string, accessToken: string, fetchImpl: typeof fetch): Promise<ApiResult<Record<string, unknown>>> {
  return requestJson(fetchImpl, `https://identitytoolkit.googleapis.com/v2/projects/${projectId}/identityPlatform:initializeAuth`, accessToken, {
    method: "POST"
  });
}

async function enableEmailPasswordProvider(projectId: string, accessToken: string, fetchImpl: typeof fetch): Promise<ApiResult<Record<string, unknown>>> {
  return requestJson(fetchImpl, `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=signIn.email`, accessToken, {
    method: "PATCH",
    body: JSON.stringify({
      name: `projects/${projectId}/config`,
      signIn: {
        email: {
          enabled: true,
          passwordRequired: true
        }
      }
    })
  });
}

async function enableGoogleProvider(projectId: string, accessToken: string, fetchImpl: typeof fetch): Promise<ApiResult<GoogleProviderConfig>> {
  const name = `projects/${projectId}/defaultSupportedIdpConfigs/google.com`;
  const existing = await requestJson<GoogleProviderConfig>(
    fetchImpl,
    `https://identitytoolkit.googleapis.com/admin/v2/${name}`,
    accessToken,
    {
      method: "GET"
    }
  );

  if (existing.ok) {
    if (existing.payload.enabled === true) return existing;
    return requestJson<GoogleProviderConfig>(fetchImpl, `https://identitytoolkit.googleapis.com/admin/v2/${name}?updateMask=enabled`, accessToken, {
      method: "PATCH",
      body: JSON.stringify({
        name,
        enabled: true
      })
    });
  }

  if (existing.status !== 404) return existing;

  return requestJson<GoogleProviderConfig>(
    fetchImpl,
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/defaultSupportedIdpConfigs?idpId=google.com`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        name,
        enabled: true
      })
    }
  );
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
    throw new Error(`Google OAuth token exchange failed: ${response.status} ${sanitizeErrorMessage(payload.error_description ?? payload.error ?? "unknown error")}`);
  }

  return payload.access_token;
}

async function requestJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  accessToken: string,
  init: RequestInit
): Promise<ApiResult<T>> {
  const response = await fetchImpl(url, {
    ...init,
    headers: new Headers({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    })
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  const message = payload.error?.message ?? (response.ok ? "OK" : "unknown error");

  return {
    ok: response.ok,
    status: response.status,
    payload,
    message
  };
}

function readServiceAccountCredential(env: EnvironmentSource): ServiceAccountCredential {
  const serviceAccount = readRequired(env, "FIREBASE_SERVICE_ACCOUNT");
  const decoded = serviceAccount.startsWith("{") ? serviceAccount : Buffer.from(serviceAccount, "base64").toString("utf8");
  const parsed = JSON.parse(decoded) as { client_email?: string; private_key?: string };
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT must include client_email and private_key");
  }
  return {
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key.replace(/\\n/g, "\n")
  };
}

function sanitizeErrorMessage(message: string): string {
  return message.replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]");
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
  runFirebaseAuthBootstrap()
    .then((result) => {
      for (const error of result.errors) {
        console.error(`ERROR ${error}`);
      }
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 1);
    })
    .catch((error) => {
      console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
