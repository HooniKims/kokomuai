import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export interface ProductionPreflightInput {
  env: Record<string, string | undefined>;
  files: Record<string, boolean>;
  clientSourceFiles?: Record<string, string>;
}

export interface ProductionPreflightResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const requiredFiles = ["vercel.json", "firebase.json", "firestore.rules", "api/index.ts", "api/chat.ts", ".firebaserc", ".gitignore"];
const requiredServerEnv = [
  "OPENAI_API_KEY",
  "NEIS_API_KEY",
  "FIREBASE_PROJECT_ID",
  "KKOKKOMU_ADMIN_EMAILS",
  "LMSTUDIO_API_URL",
  "LMSTUDIO_API_KEY",
  "LMSTUDIO_GEMMA_E4B_MODEL",
  "LMSTUDIO_GEMMA_E2B_MODEL",
  "LMSTUDIO_GEMMA_12B_MODEL",
  "LMSTUDIO_GEMMA_26B_MODEL"
];
export const clientForbiddenEnvNames = [
  "OPENAI_API_KEY",
  "NEIS_API_KEY",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_SERVICE_ACCOUNT",
  "KKOKKOMU_ADMIN_EMAILS",
  "NEXT_PUBLIC_NEIS_API_KEY"
];
const requiredClientEnv = [
  "VITE_FIREBASE_AUTH_ENABLED",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID"
];

export function parseEnvText(text: string): Record<string, string> {
  const env: Record<string, string> = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key) env[key] = value;
  }

  return env;
}

export function evaluateProductionPreflight(input: ProductionPreflightInput): ProductionPreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const file of requiredFiles) {
    if (!input.files[file]) errors.push(`필수 파일이 없습니다: ${file}`);
  }

  for (const name of [...requiredServerEnv, ...requiredClientEnv]) {
    if (!hasValue(input.env, name)) errors.push(`필수 환경변수가 없습니다: ${name}`);
  }

  const serverFirebaseProjectId = input.env.FIREBASE_PROJECT_ID?.trim();
  const clientFirebaseProjectId = input.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (
    serverFirebaseProjectId &&
    clientFirebaseProjectId &&
    serverFirebaseProjectId !== clientFirebaseProjectId
  ) {
    errors.push(
      `Firebase client/server project ids must match: FIREBASE_PROJECT_ID=${serverFirebaseProjectId}, VITE_FIREBASE_PROJECT_ID=${clientFirebaseProjectId}`,
    );
  }

  if (!hasValue(input.env, "FIREBASE_SERVICE_ACCOUNT") && !(hasValue(input.env, "FIREBASE_CLIENT_EMAIL") && hasValue(input.env, "FIREBASE_PRIVATE_KEY"))) {
    errors.push("Firebase Admin 인증 정보가 없습니다. FIREBASE_SERVICE_ACCOUNT 또는 FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY를 설정해야 합니다.");
  }

  if (!hasValue(input.env, "VERCEL_TOKEN") && !(hasValue(input.env, "VERCEL_ORG_ID") && hasValue(input.env, "VERCEL_PROJECT_ID")) && !input.files[".vercel/project.json"]) {
    errors.push("Vercel 인증/프로젝트 연결 정보가 없습니다. VERCEL_TOKEN 또는 .vercel/project.json이 필요합니다.");
  }

  if (hasValue(input.env, "NEXT_PUBLIC_NEIS_API_KEY")) {
    warnings.push("NEXT_PUBLIC_NEIS_API_KEY가 남아 있습니다. 운영 배포에는 서버 전용 NEIS_API_KEY만 등록하세요.");
  }

  for (const violation of findClientSecretReferences(input.clientSourceFiles ?? {})) {
    errors.push(`클라이언트 소스에서 서버 전용 환경변수를 참조합니다: ${violation.file}: ${violation.envName}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}

function findClientSecretReferences(files: Record<string, string>): Array<{ file: string; envName: string }> {
  const violations: Array<{ file: string; envName: string }> = [];

  for (const [file, content] of Object.entries(files)) {
    for (const envName of clientForbiddenEnvNames) {
      if (contentReferencesEnvName(content, envName)) {
        violations.push({ file, envName });
      }
    }
  }

  return violations;
}

export function contentReferencesEnvName(content: string, envName: string): boolean {
  let index = content.indexOf(envName);

  while (index !== -1) {
    const previous = content[index - 1] ?? "";
    const next = content[index + envName.length] ?? "";
    if (!isEnvIdentifierCharacter(previous) && !isEnvIdentifierCharacter(next)) {
      return true;
    }
    index = content.indexOf(envName, index + envName.length);
  }

  return false;
}

function isEnvIdentifierCharacter(value: string): boolean {
  return /^[A-Z0-9_]$/.test(value);
}

function hasValue(env: Record<string, string | undefined>, name: string): boolean {
  return Boolean(env[name]?.trim());
}

function readCurrentEnv(): Record<string, string | undefined> {
  const envPath = join(process.cwd(), ".env");
  const localEnv = existsSync(envPath) ? parseEnvText(readFileSync(envPath, "utf8")) : {};
  return {
    ...localEnv,
    ...process.env
  };
}

function readCurrentFiles(): Record<string, boolean> {
  return Object.fromEntries(
    [...requiredFiles, ".vercel/project.json"].map((file) => [file, existsSync(join(process.cwd(), file))])
  );
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

function listClientSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return listClientSourceFiles(fullPath);
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = evaluateProductionPreflight({
    env: readCurrentEnv(),
    files: readCurrentFiles(),
    clientSourceFiles: readCurrentClientSourceFiles()
  });

  for (const error of result.errors) {
    console.error(`ERROR ${error}`);
  }
  for (const warning of result.warnings) {
    console.warn(`WARN ${warning}`);
  }
  console.log(result.ok ? "production preflight passed" : "production preflight failed");
  process.exit(result.ok ? 0 : 1);
}
