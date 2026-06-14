import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parseEnvText } from "./productionPreflight";

export type VercelEnvironmentTarget = "production" | "preview" | "development";

export interface VercelEnvPlanEntry {
  name: string;
  value: string;
  required: boolean;
  ready: boolean;
}

export interface MaskedVercelEnvPlanEntry {
  name: string;
  required: boolean;
  ready: boolean;
  length: number;
}

export interface VercelEnvAddCommand {
  executable: string;
  args: string[];
}

const requiredBaseEnvNames = [
  "OPENAI_API_KEY",
  "NEIS_API_KEY",
  "FIREBASE_PROJECT_ID",
  "KKOKKOMU_ADMIN_EMAILS",
  "LMSTUDIO_API_URL",
  "LMSTUDIO_API_KEY",
  "LMSTUDIO_GEMMA_E4B_MODEL",
  "LMSTUDIO_GEMMA_E2B_MODEL",
  "LMSTUDIO_GEMMA_12B_MODEL",
  "LMSTUDIO_GEMMA_26B_MODEL",
  "VITE_FIREBASE_AUTH_ENABLED",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID"
];

export function buildVercelEnvSyncPlan(env: Record<string, string | undefined>): VercelEnvPlanEntry[] {
  const firebaseAdminNames = resolveFirebaseAdminEnvNames(env);
  const names = [...requiredBaseEnvNames, ...firebaseAdminNames];

  return names.map((name) => {
    const value = env[name]?.trim() ?? "";
    return {
      name,
      value,
      required: true,
      ready: value.length > 0
    };
  });
}

export function maskVercelEnvPlan(plan: VercelEnvPlanEntry[]): MaskedVercelEnvPlanEntry[] {
  return plan.map((entry) => ({
    name: entry.name,
    required: entry.required,
    ready: entry.ready,
    length: entry.value.length
  }));
}

export function parseVercelTargets(value: string | undefined): VercelEnvironmentTarget[] {
  const targets = (value || "production")
    .split(",")
    .map((target) => target.trim())
    .filter(Boolean);
  const allowed = new Set(["production", "preview", "development"]);
  const invalid = targets.filter((target) => !allowed.has(target));
  if (invalid.length > 0) {
    throw new Error(`지원하지 않는 Vercel 환경입니다: ${invalid.join(", ")}`);
  }
  return targets as VercelEnvironmentTarget[];
}

export function buildVercelEnvAddCommand(
  entry: Pick<VercelEnvPlanEntry, "name">,
  target: VercelEnvironmentTarget,
  platform: NodeJS.Platform = process.platform
): VercelEnvAddCommand {
  const vercelArgs = ["vercel", "env", "add", entry.name, target, "--force", "--yes", "--non-interactive"];
  if (platform === "win32") {
    return {
      executable: "cmd.exe",
      args: ["/d", "/s", "/c", `npx ${vercelArgs.join(" ")}`]
    };
  }

  return {
    executable: "npx",
    args: vercelArgs
  };
}

export function buildVercelChildProcessEnv(
  env: Record<string, string | undefined>,
  baseEnv: Record<string, string | undefined> = process.env
): Record<string, string> {
  const childEnv = Object.fromEntries(
    Object.entries(baseEnv).filter(
      (entry): entry is [string, string] =>
        isValidProcessEnvName(entry[0]) && entry[1] !== undefined
    )
  );
  const token = env.VERCEL_TOKEN?.trim() || baseEnv.VERCEL_TOKEN?.trim();

  if (token) {
    childEnv.VERCEL_TOKEN = token;
  } else {
    delete childEnv.VERCEL_TOKEN;
  }

  return childEnv;
}

function isValidProcessEnvName(name: string): boolean {
  return name.length > 0 && !name.includes("=");
}

async function main() {
  const args = process.argv.slice(2);
  const shouldApply = args.includes("--apply");
  const env = readCurrentEnv();
  const targets = parseVercelTargets(readArgValue(args, "--targets") ?? env.VERCEL_ENV_TARGETS);
  const plan = buildVercelEnvSyncPlan(env);
  const missing = plan.filter((entry) => entry.required && !entry.ready);

  console.log(JSON.stringify({ targets, variables: maskVercelEnvPlan(plan) }, null, 2));

  if (missing.length > 0) {
    console.error(`ERROR Vercel에 등록할 필수 환경변수가 없습니다: ${missing.map((entry) => entry.name).join(", ")}`);
    process.exit(1);
  }

  if (!shouldApply) {
    console.log("dry run: 실제 등록은 하지 않았습니다. 적용하려면 npm run vercel:env:sync 를 실행하세요.");
    return;
  }

  for (const target of targets) {
    for (const entry of plan) {
      await addVercelEnv(entry, target, env);
      console.log(`synced ${entry.name} to ${target}`);
    }
  }
}

function resolveFirebaseAdminEnvNames(env: Record<string, string | undefined>): string[] {
  if (env.FIREBASE_SERVICE_ACCOUNT?.trim()) return ["FIREBASE_SERVICE_ACCOUNT"];
  return ["FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"];
}

function readCurrentEnv(): Record<string, string | undefined> {
  const envPath = join(process.cwd(), ".env");
  const fileEnv = existsSync(envPath) ? parseEnvText(readFileSync(envPath, "utf8")) : {};
  return {
    ...fileEnv,
    ...process.env
  };
}

function readArgValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function addVercelEnv(
  entry: VercelEnvPlanEntry,
  target: VercelEnvironmentTarget,
  env: Record<string, string | undefined>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = buildVercelEnvAddCommand(entry, target);
    const timeoutMs = readTimeoutMs(env.VERCEL_ENV_SYNC_TIMEOUT_MS);
    const child = spawn(command.executable, command.args, {
      cwd: process.cwd(),
      env: buildVercelChildProcessEnv(env),
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`vercel env add ${entry.name} ${target} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdin.end(entry.value);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`vercel env add ${entry.name} ${target} failed: ${stderr.trim()}`));
    });
  });
}

function readTimeoutMs(value: string | undefined): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 1000) return parsed;
  return 60_000;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
