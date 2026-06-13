import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDotEnvText } from "../server/serverEnv";

export interface VercelProjectConfig {
  orgId: string;
  projectId: string;
}

type EnvironmentSource = Record<string, string | undefined>;

export function buildVercelProjectConfig(env: EnvironmentSource): VercelProjectConfig {
  const orgId = env.VERCEL_ORG_ID?.trim();
  const projectId = env.VERCEL_PROJECT_ID?.trim();
  if (!orgId || !projectId) {
    throw new Error(
      "VERCEL_ORG_ID와 VERCEL_PROJECT_ID가 모두 필요합니다. Vercel 대시보드(https://vercel.com/dashboard)에서 Project ID와 Team ID를 확인하세요."
    );
  }

  return { orgId, projectId };
}

export function serializeVercelProjectConfig(config: VercelProjectConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function readCurrentEnv(): EnvironmentSource {
  const envPath = join(process.cwd(), ".env");
  const fileEnv = existsSync(envPath) ? parseDotEnvText(readFileSync(envPath, "utf8")) : {};
  return {
    ...fileEnv,
    ...process.env
  };
}

function writeProjectJson(config: VercelProjectConfig, targetPath: string, force: boolean): "created" | "unchanged" {
  if (existsSync(targetPath) && !force) return "unchanged";
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, serializeVercelProjectConfig(config), "utf8");
  return "created";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const force = process.argv.includes("--force");
    const targetPath = join(process.cwd(), ".vercel", "project.json");
    const config = buildVercelProjectConfig(readCurrentEnv());
    const status = writeProjectJson(config, targetPath, force);
    console.log(status === "created" ? ".vercel/project.json 생성 완료" : ".vercel/project.json이 이미 있습니다. 다시 쓰려면 --force를 사용하세요.");
  } catch (error) {
    console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
