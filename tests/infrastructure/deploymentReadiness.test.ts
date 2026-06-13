import { describe, expect, it } from "vitest";
import {
  buildDeploymentReadinessReport,
  buildNpmAuditCommand,
  parseNpmAuditSummary,
  scanCorsWildcardIssues
} from "../../scripts/deploymentReadiness";

describe("deployment readiness report", () => {
  it("marks deployment as ready when all required gates pass", () => {
    const report = buildDeploymentReadinessReport({
      preflight: {
        ok: true,
        errors: [],
        warnings: []
      },
      firebaseAuth: {
        ok: true,
        errors: [],
        providers: {
          emailPassword: "enabled",
          google: "enabled"
        }
      },
      vercelEnv: [
        { name: "OPENAI_API_KEY", required: true, ready: true, length: 164 },
        { name: "VITE_FIREBASE_API_KEY", required: true, ready: true, length: 39 }
      ],
      audit: {
        high: 0,
        critical: 0
      }
    });

    expect(report.ok).toBe(true);
    expect(report.status).toBe("ready_to_deploy");
    expect(report.gates.map((gate) => `${gate.name}:${gate.status}`)).toEqual([
      "production_preflight:pass",
      "firebase_auth:pass",
      "vercel_environment:pass",
      "security_audit:pass"
    ]);
    expect(report.gates.find((gate) => gate.name === "security_audit")?.details).toContain("cors wildcard: 0");
    expect(report.nextCommands).toEqual([
      "npm run vercel:env:sync",
      "npx vercel deploy --prod --yes",
      "$env:DEPLOY_URL='https://배포주소'; npm run smoke:deploy"
    ]);
  });

  it("keeps deployment blocked when Firebase Auth and Vercel connection are incomplete", () => {
    const report = buildDeploymentReadinessReport({
      preflight: {
        ok: false,
        errors: ["Vercel 인증/프로젝트 연결 정보가 없습니다. VERCEL_TOKEN 또는 .vercel/project.json이 필요합니다."],
        warnings: []
      },
      firebaseAuth: {
        ok: false,
        errors: ["Firebase Authentication이 아직 초기화되어 있지 않습니다. Firebase 콘솔에서 Authentication을 시작하고 이메일/비밀번호와 Google 제공자를 활성화하세요."],
        providers: {
          emailPassword: "unknown",
          google: "unknown"
        }
      },
      vercelEnv: [
        { name: "OPENAI_API_KEY", required: true, ready: true, length: 164 },
        { name: "FIREBASE_SERVICE_ACCOUNT", required: true, ready: true, length: 2336 }
      ],
      firebaseProjectId: "kkokkomu-d6a4c",
      audit: {
        high: 0,
        critical: 0
      }
    });

    expect(report.ok).toBe(false);
    expect(report.status).toBe("blocked");
    expect(report.gates.find((gate) => gate.name === "firebase_auth")).toEqual({
      name: "firebase_auth",
      status: "fail",
      summary: "Firebase Auth provider check failed",
      details: ["emailPassword: unknown", "google: unknown"],
      nextActions: [
        "Firebase 콘솔에서 Authentication을 시작하고 이메일/비밀번호와 Google 제공자를 활성화합니다.",
        "Firebase Auth 제공자 설정: https://console.firebase.google.com/project/kkokkomu-d6a4c/authentication/providers",
        "설정 후 npm run firebase:auth:check를 다시 실행합니다."
      ]
    });
    expect(report.gates.find((gate) => gate.name === "production_preflight")?.nextActions).toEqual([
      "Vercel 프로젝트를 만들거나 기존 프로젝트 설정에서 Project ID와 Team ID를 확인합니다.",
      "Vercel 대시보드: https://vercel.com/dashboard",
      ".env에 VERCEL_ORG_ID, VERCEL_PROJECT_ID, VERCEL_TOKEN을 넣은 뒤 npm run vercel:link:env를 실행합니다."
    ]);
    expect(JSON.stringify(report)).not.toContain("2336");
    expect(JSON.stringify(report)).not.toContain("164");
  });

  it("fails the security audit gate when high or critical vulnerabilities are present", () => {
    const report = buildDeploymentReadinessReport({
      preflight: { ok: true, errors: [], warnings: [] },
      firebaseAuth: {
        ok: true,
        errors: [],
        providers: {
          emailPassword: "enabled",
          google: "enabled"
        }
      },
      vercelEnv: [{ name: "OPENAI_API_KEY", required: true, ready: true, length: 164 }],
      audit: {
        high: 1,
        critical: 0
      }
    });

    expect(report.ok).toBe(false);
    expect(report.gates.find((gate) => gate.name === "security_audit")).toEqual({
      name: "security_audit",
      status: "fail",
      summary: "high/critical vulnerabilities found",
      details: ["high: 1", "critical: 0", "cors wildcard: 0"],
      nextActions: ["high 또는 critical 취약점을 해결한 뒤 npm audit --omit=dev --json을 다시 실행합니다."]
    });
  });

  it("fails the security audit gate when server code exposes wildcard CORS", () => {
    const report = buildDeploymentReadinessReport({
      preflight: { ok: true, errors: [], warnings: [] },
      firebaseAuth: {
        ok: true,
        errors: [],
        providers: {
          emailPassword: "enabled",
          google: "enabled"
        }
      },
      vercelEnv: [{ name: "OPENAI_API_KEY", required: true, ready: true, length: 164 }],
      audit: {
        high: 0,
        critical: 0,
        corsWildcardIssues: ["server/apiHandler.ts:42 wildcard Access-Control-Allow-Origin"]
      }
    });

    expect(report.ok).toBe(false);
    expect(report.gates.find((gate) => gate.name === "security_audit")).toEqual({
      name: "security_audit",
      status: "fail",
      summary: "security policy regressions found",
      details: ["high: 0", "critical: 0", "cors wildcard: 1", "server/apiHandler.ts:42 wildcard Access-Control-Allow-Origin"],
      nextActions: ["API 응답에서 Access-Control-Allow-Origin: * 사용을 제거하고 허용 Origin만 반영합니다."]
    });
  });

  it("detects wildcard CORS only in server API source files", () => {
    expect(
      scanCorsWildcardIssues({
        "server/apiHandler.ts": 'response.writeHead(200, { "Access-Control-Allow-Origin": "*" });',
        "api/[...path].ts": 'response.setHeader("Access-Control-Allow-Origin", "*");',
        "docs/production-security-checklist.md": "Access-Control-Allow-Origin: * 사용 금지"
      })
    ).toEqual([
      "server/apiHandler.ts:1 wildcard Access-Control-Allow-Origin",
      "api/[...path].ts:1 wildcard Access-Control-Allow-Origin"
    ]);
  });

  it("parses npm audit JSON metadata without carrying vulnerability details into the report", () => {
    expect(
      parseNpmAuditSummary(
        JSON.stringify({
          vulnerabilities: {
            uuid: {
              name: "uuid",
              via: [{ title: "uuid issue", url: "https://example.test/advisory" }]
            }
          },
          metadata: {
            vulnerabilities: {
              info: 0,
              low: 0,
              moderate: 6,
              high: 0,
              critical: 1,
              total: 7
            }
          }
        })
      )
    ).toEqual({
      high: 0,
      critical: 1
    });
  });

  it("treats malformed npm audit JSON as an unavailable audit summary", () => {
    expect(parseNpmAuditSummary("not-json")).toBeUndefined();
  });

  it("uses cmd.exe for npm audit on Windows so npm.cmd spawn does not fail with EINVAL", () => {
    expect(buildNpmAuditCommand("win32")).toEqual({
      executable: "cmd.exe",
      args: ["/d", "/s", "/c", "npm audit --omit=dev --json"]
    });
    expect(buildNpmAuditCommand("linux")).toEqual({
      executable: "npm",
      args: ["audit", "--omit=dev", "--json"]
    });
  });
});
