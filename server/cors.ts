import type http from "node:http";

type EnvironmentSource = Record<string, string | undefined>;

const DEV_APP_ORIGINS = new Set(["http://127.0.0.1:5173", "http://localhost:5173"]);

export function applyCorsHeaders(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  env: EnvironmentSource | undefined
): void {
  const origin = getHeaderValue(request.headers.origin);
  if (!origin || !isAllowedCorsOrigin(origin, request, env)) return;

  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
}

export function writeCorsPreflight(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  env: EnvironmentSource | undefined
): void {
  const origin = getHeaderValue(request.headers.origin);
  if (origin && !isAllowedCorsOrigin(origin, request, env)) {
    response.writeHead(403, {
      "Cache-Control": "no-store",
      Vary: "Origin"
    });
    response.end();
    return;
  }

  applyCorsHeaders(request, response, env);
  response.writeHead(204, {
    "Access-Control-Allow-Methods": "POST,GET,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store"
  });
  response.end();
}

function isAllowedCorsOrigin(origin: string, request: http.IncomingMessage, env: EnvironmentSource | undefined): boolean {
  if (DEV_APP_ORIGINS.has(origin)) return true;
  if (getConfiguredOrigins(env).has(origin)) return true;

  const requestOrigin = getRequestOrigin(request);
  return Boolean(requestOrigin && requestOrigin === origin);
}

function getConfiguredOrigins(env: EnvironmentSource | undefined): Set<string> {
  return new Set(
    (env?.KKOKKOMU_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

function getRequestOrigin(request: http.IncomingMessage): string | null {
  const host = getHeaderValue(request.headers["x-forwarded-host"]) ?? getHeaderValue(request.headers.host);
  if (!host) return null;

  const forwardedProto = getHeaderValue(request.headers["x-forwarded-proto"]);
  const protocol = forwardedProto ?? (host.startsWith("127.0.0.1") || host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
