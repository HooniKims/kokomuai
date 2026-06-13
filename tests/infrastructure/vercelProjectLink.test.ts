import { describe, expect, it } from "vitest";
import { buildVercelProjectConfig, serializeVercelProjectConfig } from "../../scripts/linkVercelProject";

describe("Vercel project link helper", () => {
  it("builds the .vercel/project.json payload from Vercel project environment ids", () => {
    const config = buildVercelProjectConfig({
      VERCEL_ORG_ID: "team_123",
      VERCEL_PROJECT_ID: "prj_456",
      VERCEL_TOKEN: "control-token"
    });

    expect(config).toEqual({
      orgId: "team_123",
      projectId: "prj_456"
    });
    expect(serializeVercelProjectConfig(config)).toBe('{\n  "orgId": "team_123",\n  "projectId": "prj_456"\n}\n');
    expect(serializeVercelProjectConfig(config)).not.toContain("control-token");
  });

  it("fails with a clear setup message when either Vercel id is missing", () => {
    expect(() => buildVercelProjectConfig({ VERCEL_ORG_ID: "team_123" })).toThrow(
      "VERCEL_ORG_ID와 VERCEL_PROJECT_ID가 모두 필요합니다. Vercel 대시보드(https://vercel.com/dashboard)에서 Project ID와 Team ID를 확인하세요."
    );
    expect(() => buildVercelProjectConfig({ VERCEL_PROJECT_ID: "prj_456" })).toThrow(
      "VERCEL_ORG_ID와 VERCEL_PROJECT_ID가 모두 필요합니다. Vercel 대시보드(https://vercel.com/dashboard)에서 Project ID와 Team ID를 확인하세요."
    );
  });
});
