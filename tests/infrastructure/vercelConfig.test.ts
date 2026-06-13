import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Vercel config", () => {
  it("exposes API routes through one Vercel catch-all function", async () => {
    await expect(access("api/index.ts")).resolves.toBeUndefined();
    await expect(access("api/health.ts")).resolves.toBeUndefined();

    const apiEntry = await readFile("api/index.ts", "utf8");
    expect(apiEntry).toContain("../server/vercelRequestHandler.js");
  });

  it("keeps API routes server-side and rewrites app routes to the Vite entry", async () => {
    const config = JSON.parse(await readFile("vercel.json", "utf8")) as {
      outputDirectory: string;
      rewrites: Array<{ source: string; destination: string }>;
    };

    expect(config.outputDirectory).toBe("dist");
    expect(config.rewrites).toEqual(
      expect.arrayContaining([
        { source: "/s/:token", destination: "/index.html" },
        { source: "/privacy", destination: "/index.html" },
        { source: "/api/:path*", destination: "/api/index" },
        { source: "/((?!api/.*).*)", destination: "/index.html" },
      ]),
    );
  });

  it("sets production security headers without blocking Firebase and API calls", async () => {
    const config = JSON.parse(await readFile("vercel.json", "utf8")) as {
      headers?: Array<{
        source: string;
        headers: Array<{ key: string; value: string }>;
      }>;
    };
    const allRoutes = config.headers?.find((entry) => entry.source === "/(.*)");
    const headers = Object.fromEntries(
      (allRoutes?.headers ?? []).map((header) => [
        header.key.toLowerCase(),
        header.value,
      ]),
    );

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains; preload",
    );
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["content-security-policy"]).toContain(
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://*.google.com",
    );
  });

  it("prevents deployed API responses from being cached by browsers or proxies", async () => {
    const config = JSON.parse(await readFile("vercel.json", "utf8")) as {
      headers?: Array<{
        source: string;
        headers: Array<{ key: string; value: string }>;
      }>;
    };
    const apiRoutes = config.headers?.find(
      (entry) => entry.source === "/api/(.*)",
    );
    const headers = Object.fromEntries(
      (apiRoutes?.headers ?? []).map((header) => [
        header.key.toLowerCase(),
        header.value,
      ]),
    );

    expect(headers["cache-control"]).toBe("no-store");
  });
});
