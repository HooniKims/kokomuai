import { describe, expect, it } from "vitest";
import { normalizeDeployUrl, runPostDeploySmokeTest } from "../../scripts/postDeploySmokeTest";

describe("post deploy smoke test", () => {
  it("checks the deployed SPA, privacy route, API health, unauthenticated teacher protection, and security headers", async () => {
    const requested: Array<{ url: string; method: string; origin: string | null }> = [];
    const result = await runPostDeploySmokeTest({
      baseUrl: "https://kkokkomu.example/",
      fetchImpl: async (url, init) => {
        requested.push({
          url: String(url),
          method: init?.method ?? "GET",
          origin: new Headers(init?.headers).get("origin")
        });
        if (String(url).endsWith("/api/chat") && init?.method === "OPTIONS") {
          return textResponse(403, "", apiHeaders());
        }
        if (String(url).endsWith("/api/health")) {
          return jsonResponse(200, { ok: true, provider: "openai", model: "gpt-5.4-nano" }, apiHeaders());
        }
        if (String(url).endsWith("/api/teachers")) {
          return jsonResponse(403, { error: "auth_required" }, apiHeaders());
        }
        return textResponse(200, "<!doctype html><title>꼬꼬무AI</title><div id=\"root\"></div>", securityHeaders());
      }
    });

    expect(result.ok).toBe(true);
    expect(result.checks.every((check) => check.ok)).toBe(true);
    expect(requested).toEqual([
      { url: "https://kkokkomu.example/", method: "GET", origin: null },
      { url: "https://kkokkomu.example/privacy", method: "GET", origin: null },
      { url: "https://kkokkomu.example/api/health", method: "GET", origin: null },
      { url: "https://kkokkomu.example/api/teachers", method: "GET", origin: null },
      { url: "https://kkokkomu.example/", method: "GET", origin: null },
      { url: "https://kkokkomu.example/api/chat", method: "OPTIONS", origin: "https://evil.example" }
    ]);
    expect(result.checks.find((check) => check.name === "cors-preflight")).toMatchObject({
      ok: true,
      status: 403,
      message: "Untrusted CORS preflight is rejected"
    });
  });

  it("reports failing checks without throwing so CI logs show every issue", async () => {
    const result = await runPostDeploySmokeTest({
      baseUrl: "https://kkokkomu.example",
      fetchImpl: async (url) => {
        if (String(url).endsWith("/api/health")) {
          return jsonResponse(200, { ok: false }, apiHeaders());
        }
        if (String(url).endsWith("/api/teachers")) {
          return jsonResponse(200, { teachers: [] });
        }
        return textResponse(404, "not found");
      }
    });

    expect(result.ok).toBe(false);
    expect(result.checks.filter((check) => !check.ok).map((check) => check.name)).toEqual([
      "spa-root",
      "privacy-route",
      "api-health",
      "teacher-api-auth",
      "security-headers",
      "cors-preflight"
    ]);
  });

  it("fails the protected API smoke check when cache-control no-store is missing", async () => {
    const result = await runPostDeploySmokeTest({
      baseUrl: "https://kkokkomu.example",
      fetchImpl: async (url) => {
        if (String(url).endsWith("/api/health")) {
          return jsonResponse(200, { ok: true, provider: "openai", model: "gpt-5.4-nano" }, apiHeaders());
        }
        if (String(url).endsWith("/api/teachers")) {
          return jsonResponse(403, { error: "auth_required" });
        }
        return textResponse(200, "<!doctype html><title>꼬꼬무AI</title><div id=\"root\"></div>", securityHeaders());
      }
    });

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.name === "teacher-api-auth")).toMatchObject({
      ok: false,
      message: "Teacher API must reject anonymous access with Cache-Control: no-store"
    });
  });

  it("fails when deployed API accepts untrusted CORS preflight or exposes wildcard origin", async () => {
    const result = await runPostDeploySmokeTest({
      baseUrl: "https://kkokkomu.example",
      fetchImpl: async (url, init) => {
        if (String(url).endsWith("/api/chat") && init?.method === "OPTIONS") {
          return emptyResponse(204, {
            ...apiHeaders(),
            "Access-Control-Allow-Origin": "*"
          });
        }
        if (String(url).endsWith("/api/health")) {
          return jsonResponse(200, { ok: true, provider: "openai", model: "gpt-5.4-nano" }, apiHeaders());
        }
        if (String(url).endsWith("/api/teachers")) {
          return jsonResponse(403, { error: "auth_required" }, apiHeaders());
        }
        return textResponse(200, "<!doctype html><title>꼬꼬무AI</title><div id=\"root\"></div>", securityHeaders());
      }
    });

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.name === "cors-preflight")).toMatchObject({
      ok: false,
      status: 204,
      message: "Untrusted CORS preflight must be rejected without wildcard Access-Control-Allow-Origin"
    });
  });

  it("normalizes deployment URLs", () => {
    expect(normalizeDeployUrl("https://kkokkomu.example/")).toBe("https://kkokkomu.example");
    expect(() => normalizeDeployUrl("")).toThrow("DEPLOY_URL이 필요합니다.");
    expect(() => normalizeDeployUrl("http://localhost:5173")).toThrow("배포 URL은 https:// 로 시작해야 합니다.");
  });
});

function jsonResponse(status: number, payload: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}

function textResponse(status: number, body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers }
  });
}

function emptyResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, {
    status,
    headers
  });
}

function securityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=()"
  };
}

function apiHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-store"
  };
}
