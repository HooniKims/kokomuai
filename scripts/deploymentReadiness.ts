import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildFirebaseAuthProviderSetupActions,
  runFirebaseAuthProviderCheck,
  type FirebaseAuthProviderCheckResult
} from "./checkFirebaseAuthProviders";
import { evaluateProductionPreflight, parseEnvText, type ProductionPreflightResult } from "./productionPreflight";
import { buildVercelEnvSyncPlan, maskVercelEnvPlan, type MaskedVercelEnvPlanEntry } from "./syncVercelEnv";

type GateStatus = "pass" | "fail" | "warn";

interface AuditSummary {
  high: number;
  critical: number;
  corsWildcardIssues?: string[];
}

export interface DeploymentReadinessGate {
  name: "production_preflight" | "firebase_auth" | "vercel_environment" | "security_audit";
  status: GateStatus;
  summary: string;
  details: string[];
  nextActions: string[];
}

export interface DeploymentReadinessReport {
  ok: boolean;
  status: "ready_to_deploy" | "blocked";
  gates: DeploymentReadinessGate[];
  nextCommands: string[];
}

export interface DeploymentReadinessInput {
  preflight: ProductionPreflightResult;
  firebaseAuth: FirebaseAuthProviderCheckResult;
  vercelEnv: MaskedVercelEnvPlanEntry[];
  firebaseProjectId?: string;
  audit?: AuditSummary;
}

const readyNextCommands = [
  "npm run vercel:env:sync",
  "npx vercel deploy --prod --yes",
  "$env:DEPLOY_URL='https://배포주소'; npm run smoke:deploy"
];

export function buildDeploymentReadinessReport(input: DeploymentReadinessInput): DeploymentReadinessReport {
  const gates = [
    buildPreflightGate(input.preflight),
    buildFirebaseAuthGate(input.firebaseAuth, input.firebaseProjectId),
    buildVercelEnvGate(input.vercelEnv),
    buildSecurityAuditGate(input.audit)
  ];
  const ok = gates.every((gate) => gate.status === "pass" || gate.status === "warn");

  return {
    ok,
    status: ok ? "ready_to_deploy" : "blocked",
    gates,
    nextCommands: ok ? readyNextCommands : []
  };
}

export function parseNpmAuditSummary(jsonText: string): AuditSummary | undefined {
  try {
    const parsed = JSON.parse(jsonText) as {
      metadata?: {
        vulnerabilities?: {
          high?: number;
          critical?: number;
        };
      };
    };
    const vulnerabilities = parsed.metadata?.vulnerabilities;
    if (!vulnerabilities) return undefined;
    return {
      high: Number(vulnerabilities.high ?? 0),
      critical: Number(vulnerabilities.critical ?? 0)
    };
  } catch {
    return undefined;
  }
}

export function buildNpmAuditCommand(platform: NodeJS.Platform = process.platform): { executable: string; args: string[] } {
  if (platform === "win32") {
    return {
      executable: "cmd.exe",
      args: ["/d", "/s", "/c", "npm audit --omit=dev --json"]
    };
  }

  return {
    executable: "npm",
    args: ["audit", "--omit=dev", "--json"]
  };
}

export function scanCorsWildcardIssues(sourceFiles: Record<string, string>): string[] {
  return Object.entries(sourceFiles).flatMap(([filePath, content]) => {
    if (!/^(api|server)\//.test(filePath.replaceAll("\\", "/"))) return [];

    return content
      .split(/\r?\n/)
      .flatMap((line, index) =>
        hasCorsWildcard(line) ? [`${filePath}:${index + 1} wildcard Access-Control-Allow-Origin`] : []
      );
  });
}

function buildPreflightGate(preflight: ProductionPreflightResult): DeploymentReadinessGate {
  const nextActions = new Set<string>();

  for (const error of preflight.errors) {
    if (error.includes("Vercel 인증/프로젝트 연결 정보")) {
      nextActions.add("Vercel 프로젝트를 만들거나 기존 프로젝트 설정에서 Project ID와 Team ID를 확인합니다.");
      nextActions.add("Vercel 대시보드: https://vercel.com/dashboard");
      nextActions.add(".env에 VERCEL_ORG_ID, VERCEL_PROJECT_ID, VERCEL_TOKEN을 넣은 뒤 npm run vercel:link:env를 실행합니다.");
    } else if (error.includes("Firebase Admin 인증 정보")) {
      nextActions.add("FIREBASE_SERVICE_ACCOUNT 또는 FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY를 서버 환경변수로 준비합니다.");
    } else if (error.startsWith("필수 환경변수가 없습니다:")) {
      nextActions.add("누락된 필수 환경변수를 .env와 Vercel production 환경에 등록합니다.");
    } else if (error.startsWith("필수 파일이 없습니다:")) {
      nextActions.add("누락된 배포 설정 파일을 복구합니다.");
    }
  }

  return {
    name: "production_preflight",
    status: preflight.ok ? (preflight.warnings.length > 0 ? "warn" : "pass") : "fail",
    summary: preflight.ok ? "production preflight passed" : "production preflight failed",
    details: [...preflight.errors, ...preflight.warnings],
    nextActions: [...nextActions]
  };
}

function buildFirebaseAuthGate(firebaseAuth: FirebaseAuthProviderCheckResult, firebaseProjectId?: string): DeploymentReadinessGate {
  const nextActions = firebaseAuth.ok
      ? []
      : [
        ...buildFirebaseAuthProviderSetupActions(firebaseProjectId)
      ];

  return {
    name: "firebase_auth",
    status: firebaseAuth.ok ? "pass" : "fail",
    summary: firebaseAuth.ok ? "Firebase Auth providers enabled" : "Firebase Auth provider check failed",
    details: [`emailPassword: ${firebaseAuth.providers.emailPassword}`, `google: ${firebaseAuth.providers.google}`],
    nextActions
  };
}

function buildVercelEnvGate(vercelEnv: MaskedVercelEnvPlanEntry[]): DeploymentReadinessGate {
  const missing = vercelEnv.filter((entry) => entry.required && !entry.ready).map((entry) => entry.name);

  return {
    name: "vercel_environment",
    status: missing.length === 0 ? "pass" : "fail",
    summary: missing.length === 0 ? "Vercel environment variables are ready" : "Vercel environment variables are missing",
    details: missing,
    nextActions: missing.length === 0 ? [] : ["누락된 Vercel 환경변수를 .env에 보강한 뒤 npm run vercel:env:dry-run을 다시 실행합니다."]
  };
}

function buildSecurityAuditGate(audit: AuditSummary | undefined): DeploymentReadinessGate {
  if (!audit) {
    return {
      name: "security_audit",
      status: "warn",
      summary: "security audit was not provided",
      details: [],
      nextActions: ["npm audit --omit=dev --json 결과의 high/critical 개수를 확인합니다."]
    };
  }

  const corsWildcardIssues = audit.corsWildcardIssues ?? [];
  const failed = audit.high > 0 || audit.critical > 0 || corsWildcardIssues.length > 0;
  const nextActions = [];
  if (audit.high > 0 || audit.critical > 0) {
    nextActions.push("high 또는 critical 취약점을 해결한 뒤 npm audit --omit=dev --json을 다시 실행합니다.");
  }
  if (corsWildcardIssues.length > 0) {
    nextActions.push("API 응답에서 Access-Control-Allow-Origin: * 사용을 제거하고 허용 Origin만 반영합니다.");
  }

  return {
    name: "security_audit",
    status: failed ? "fail" : "pass",
    summary: failed
      ? corsWildcardIssues.length > 0
        ? audit.high > 0 || audit.critical > 0
          ? "high/critical vulnerabilities or policy regressions found"
          : "security policy regressions found"
        : "high/critical vulnerabilities found"
      : "no high/critical vulnerabilities",
    details: [`high: ${audit.high}`, `critical: ${audit.critical}`, `cors wildcard: ${corsWildcardIssues.length}`, ...corsWildcardIssues],
    nextActions
  };
}

function readCurrentEnv(): Record<string, string | undefined> {
  const envPath = join(process.cwd(), ".env");
  const fileEnv = existsSync(envPath) ? parseEnvText(readFileSync(envPath, "utf8")) : {};
  return {
    ...fileEnv,
    ...process.env
  };
}

function readCurrentFiles(): Record<string, boolean> {
  const requiredFiles = ["vercel.json", "firebase.json", "firestore.rules", "api/index.ts", "api/chat.ts", ".firebaserc", ".gitignore", ".vercel/project.json"];
  return Object.fromEntries(requiredFiles.map((file) => [file, existsSync(join(process.cwd(), file))]));
}

function readCurrentClientSourceFiles(): Record<string, string> {
  const sourceRoot = join(process.cwd(), "src");
  if (!existsSync(sourceRoot)) return {};
  return Object.fromEntries(
    listClientSourceFiles(sourceRoot).map((absolutePath) => [
      absolutePath.replace(`${process.cwd()}\\`, "").replaceAll("\\", "/"),
      readFileSync(absolutePath, "utf8")
    ])
  );
}

function readCurrentSecuritySourceFiles(): Record<string, string> {
  return {
    ...readSourceFilesFromRoot("server"),
    ...readSourceFilesFromRoot("api")
  };
}

function readSourceFilesFromRoot(relativeRoot: string): Record<string, string> {
  const sourceRoot = join(process.cwd(), relativeRoot);
  if (!existsSync(sourceRoot)) return {};
  return Object.fromEntries(
    listSourceFiles(sourceRoot).map((absolutePath) => [
      absolutePath.replace(`${process.cwd()}\\`, "").replaceAll("\\", "/"),
      readFileSync(absolutePath, "utf8")
    ])
  );
}

function listClientSourceFiles(directory: string): string[] {
  return listSourceFiles(directory);
}

function listSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const env = readCurrentEnv();
  Promise.all([
    runFirebaseAuthProviderCheck({ env }),
    readSecurityAuditSummary(),
    Promise.resolve(
      evaluateProductionPreflight({
        env,
        files: readCurrentFiles(),
        clientSourceFiles: readCurrentClientSourceFiles()
      })
    )
  ])
    .then(([firebaseAuth, audit, preflight]) => {
      const report = buildDeploymentReadinessReport({
        preflight,
        firebaseAuth,
        vercelEnv: maskVercelEnvPlan(buildVercelEnvSyncPlan(env)),
        firebaseProjectId: env.FIREBASE_PROJECT_ID,
        audit
      });
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.ok ? 0 : 1);
    })
    .catch((error) => {
      console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}

function readSecurityAuditSummary(): Promise<AuditSummary | undefined> {
  return readNpmAuditSummary().then((audit) =>
    audit
      ? {
          ...audit,
          corsWildcardIssues: scanCorsWildcardIssues(readCurrentSecuritySourceFiles())
        }
      : audit
  );
}

function readNpmAuditSummary(): Promise<AuditSummary | undefined> {
  return new Promise((resolve) => {
    const command = buildNpmAuditCommand();
    const child = spawn(command.executable, command.args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.on("error", () => {
      resolve(undefined);
    });
    child.on("close", () => {
      resolve(parseNpmAuditSummary(stdout));
    });
  });
}

function hasCorsWildcard(line: string): boolean {
  return (
    /["']Access-Control-Allow-Origin["']\s*:\s*["']\*["']/.test(line) ||
    /setHeader\(\s*["']Access-Control-Allow-Origin["']\s*,\s*["']\*["']/.test(line)
  );
}
