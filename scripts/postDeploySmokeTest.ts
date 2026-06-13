import { fileURLToPath } from "node:url";

export interface SmokeCheck {
  name: string;
  ok: boolean;
  status?: number;
  message: string;
}

export interface PostDeploySmokeResult {
  ok: boolean;
  baseUrl: string;
  checks: SmokeCheck[];
}

export interface PostDeploySmokeInput {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

type JsonPayload = Record<string, unknown>;

export async function runPostDeploySmokeTest(input: PostDeploySmokeInput): Promise<PostDeploySmokeResult> {
  const baseUrl = normalizeDeployUrl(input.baseUrl);
  const fetchImpl = input.fetchImpl ?? fetch;
  const checks = await Promise.all([
    checkSpaRoute(fetchImpl, baseUrl, "/", "spa-root"),
    checkSpaRoute(fetchImpl, baseUrl, "/privacy", "privacy-route"),
    checkApiHealth(fetchImpl, baseUrl),
    checkTeacherApiAuth(fetchImpl, baseUrl),
    checkSecurityHeaders(fetchImpl, baseUrl),
    checkCorsPreflight(fetchImpl, baseUrl)
  ]);

  return {
    ok: checks.every((check) => check.ok),
    baseUrl,
    checks
  };
}

export function normalizeDeployUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("DEPLOY_URL이 필요합니다.");
  if (!trimmed.startsWith("https://")) throw new Error("배포 URL은 https:// 로 시작해야 합니다.");
  return trimmed;
}

async function checkSpaRoute(fetchImpl: typeof fetch, baseUrl: string, path: string, name: string): Promise<SmokeCheck> {
  try {
    const response = await fetchImpl(`${baseUrl}${path}`);
    const body = await response.text();
    const ok = response.ok && body.includes("꼬꼬무AI") && body.includes("root");
    return {
      name,
      ok,
      status: response.status,
      message: ok ? "SPA entry served" : "SPA entry did not return the expected 꼬꼬무AI HTML"
    };
  } catch (error) {
    return failedCheck(name, error);
  }
}

async function checkApiHealth(fetchImpl: typeof fetch, baseUrl: string): Promise<SmokeCheck> {
  const name = "api-health";
  try {
    const response = await fetchImpl(`${baseUrl}/api/health`);
    const payload = (await response.json().catch(() => ({}))) as JsonPayload;
    const ok = response.ok && payload.ok === true && typeof payload.provider === "string" && typeof payload.model === "string";
    return {
      name,
      ok,
      status: response.status,
      message: ok ? `${payload.provider}:${payload.model}` : "API health did not return ok/provider/model"
    };
  } catch (error) {
    return failedCheck(name, error);
  }
}

async function checkTeacherApiAuth(fetchImpl: typeof fetch, baseUrl: string): Promise<SmokeCheck> {
  const name = "teacher-api-auth";
  try {
    const response = await fetchImpl(`${baseUrl}/api/teachers`);
    const rejectsAnonymous = response.status === 401 || response.status === 403;
    const disablesCaching = response.headers.get("cache-control")?.includes("no-store") ?? false;
    const ok = rejectsAnonymous && disablesCaching;
    return {
      name,
      ok,
      status: response.status,
      message: ok
        ? "Teacher API rejects anonymous access with Cache-Control: no-store"
        : "Teacher API must reject anonymous access with Cache-Control: no-store"
    };
  } catch (error) {
    return failedCheck(name, error);
  }
}

async function checkSecurityHeaders(fetchImpl: typeof fetch, baseUrl: string): Promise<SmokeCheck> {
  const name = "security-headers";
  try {
    const response = await fetchImpl(`${baseUrl}/`);
    const requiredHeaders = [
      ["content-security-policy", "default-src 'self'"],
      ["content-security-policy", "frame-ancestors 'none'"],
      ["strict-transport-security", "max-age=31536000"],
      ["x-content-type-options", "nosniff"],
      ["referrer-policy", "strict-origin-when-cross-origin"],
      ["x-frame-options", "DENY"],
      ["permissions-policy", "camera=()"]
    ] as const;
    const missing = requiredHeaders.filter(([key, expected]) => !response.headers.get(key)?.includes(expected));
    const ok = response.ok && missing.length === 0;

    return {
      name,
      ok,
      status: response.status,
      message: ok ? "Security headers are present" : `Missing security headers: ${missing.map(([key]) => key).join(", ")}`
    };
  } catch (error) {
    return failedCheck(name, error);
  }
}

async function checkCorsPreflight(fetchImpl: typeof fetch, baseUrl: string): Promise<SmokeCheck> {
  const name = "cors-preflight";
  try {
    const response = await fetchImpl(`${baseUrl}/api/chat`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Authorization"
      }
    });
    const wildcardOrigin = response.headers.get("access-control-allow-origin") === "*";
    const ok = response.status === 403 && !wildcardOrigin;

    return {
      name,
      ok,
      status: response.status,
      message: ok
        ? "Untrusted CORS preflight is rejected"
        : "Untrusted CORS preflight must be rejected without wildcard Access-Control-Allow-Origin"
    };
  } catch (error) {
    return failedCheck(name, error);
  }
}

function failedCheck(name: string, error: unknown): SmokeCheck {
  return {
    name,
    ok: false,
    message: error instanceof Error ? error.message : String(error)
  };
}

function readCliUrl(args: string[], env: Record<string, string | undefined>): string {
  const index = args.indexOf("--url");
  return index === -1 ? env.DEPLOY_URL ?? "" : args[index + 1] ?? "";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runPostDeploySmokeTest({
    baseUrl: readCliUrl(process.argv.slice(2), process.env)
  })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 1);
    })
    .catch((error) => {
      console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
