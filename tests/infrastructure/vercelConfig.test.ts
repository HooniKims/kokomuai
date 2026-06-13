import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Vercel config", () => {
  it("exposes nested API routes as explicit Vercel functions", async () => {
    const requiredApiFiles = [
      "api/health.ts",
      "api/chat.ts",
      "api/teachers.ts",
      "api/chatbots.ts",
      "api/chatbots/[chatbotId].ts",
      "api/chatbots/[chatbotId]/share.ts",
      "api/share/[token].ts",
      "api/usage.ts",
      "api/schools/search.ts",
      "api/curriculum/recommend.ts",
      "api/admin/ai-settings.ts",
      "api/admin/provider-errors.ts",
      "api/admin/action-logs.ts",
      "api/admin/teachers/[teacherId]/approve.ts",
      "api/admin/teachers/[teacherId]/reject.ts",
      "api/admin/teachers/[teacherId]/disable.ts",
      "api/admin/teachers/[teacherId]/password-reset.ts",
      "api/admin/chatbots/[chatbotId]/disable.ts",
    ];

    await Promise.all(
      requiredApiFiles.map((file) =>
        expect(access(file)).resolves.toBeUndefined(),
      ),
    );
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
        { source: "/((?!api/.*).*)", destination: "/index.html" },
      ]),
    );
    expect(
      config.rewrites.some((rewrite) => rewrite.source === "/api/:path*"),
    ).toBe(false);
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
