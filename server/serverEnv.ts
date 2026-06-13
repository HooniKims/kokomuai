import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type MutableEnv = Record<string, string | undefined>;

export function loadDotEnvFile(envPath = join(process.cwd(), ".env"), targetEnv: MutableEnv = process.env): string[] {
  if (!existsSync(envPath)) return [];

  const parsed = parseDotEnvText(readFileSync(envPath, "utf8"));
  const loaded: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (targetEnv[key] !== undefined) continue;
    targetEnv[key] = value;
    loaded.push(key);
  }
  return loaded;
}

export function parseDotEnvText(text: string): Record<string, string> {
  const env: Record<string, string> = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key) continue;

    env[key] = normalizeEnvValue(trimmed.slice(separatorIndex + 1).trim());
  }

  return env;
}

function normalizeEnvValue(value: string): string {
  if (value.length >= 2) {
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value[value.length - 1] === quote) {
      const unquoted = value.slice(1, -1);
      return quote === '"' ? unquoted.replace(/\\n/g, "\n").replace(/\\"/g, '"') : unquoted;
    }
  }

  return value;
}
