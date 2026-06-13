type EnvironmentSource = Record<string, string | undefined>;

export type EnvPresenceState = "SET" | "EMPTY" | "MISSING";

export interface EnvPresence {
  name: string;
  state: EnvPresenceState;
}

export interface FirebaseServerEnv {
  projectId: string;
  credential:
    | {
        type: "split";
        clientEmail: string;
        privateKey: string;
      }
    | {
        type: "service_account";
        clientEmail: string;
        privateKey: string;
      };
  neisApiKey: string;
  openAiApiKey: string;
}

export interface FirebaseClientEnv {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket: string;
  messagingSenderId: string;
}

const presenceVariableNames = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_SERVICE_ACCOUNT",
  "NEIS_API_KEY",
  "OPENAI_API_KEY",
  "KKOKKOMU_ADMIN_EMAILS",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID"
];

const clientVariableMap = {
  VITE_FIREBASE_API_KEY: "apiKey",
  VITE_FIREBASE_AUTH_DOMAIN: "authDomain",
  VITE_FIREBASE_PROJECT_ID: "projectId",
  VITE_FIREBASE_APP_ID: "appId",
  VITE_FIREBASE_STORAGE_BUCKET: "storageBucket",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "messagingSenderId"
} as const;

interface ServiceAccountShape {
  client_email?: string;
  private_key?: string;
}

export function parseFirebaseServerEnv(env: EnvironmentSource = process.env): FirebaseServerEnv {
  const missing = collectMissingServerVariables(env);
  if (missing.length > 0) {
    throw new Error(`Missing required server environment variables: ${missing.join(", ")}`);
  }

  const projectId = readRequired(env, "FIREBASE_PROJECT_ID");
  const neisApiKey = readRequired(env, "NEIS_API_KEY");
  const openAiApiKey = readRequired(env, "OPENAI_API_KEY");
  const serviceAccount = readOptional(env, "FIREBASE_SERVICE_ACCOUNT");

  if (serviceAccount) {
    const parsed = parseServiceAccount(serviceAccount);
    return {
      projectId,
      credential: {
        type: "service_account",
        clientEmail: parsed.client_email,
        privateKey: normalizePrivateKey(parsed.private_key)
      },
      neisApiKey,
      openAiApiKey
    };
  }

  return {
    projectId,
    credential: {
      type: "split",
      clientEmail: readRequired(env, "FIREBASE_CLIENT_EMAIL"),
      privateKey: normalizePrivateKey(readRequired(env, "FIREBASE_PRIVATE_KEY"))
    },
    neisApiKey,
    openAiApiKey
  };
}

export function parseFirebaseClientEnv(env: EnvironmentSource = process.env): FirebaseClientEnv {
  const missing = Object.keys(clientVariableMap).filter((name) => !readOptional(env, name));
  if (missing.length > 0) {
    throw new Error(`Missing required client environment variables: ${missing.join(", ")}`);
  }

  return Object.fromEntries(
    Object.entries(clientVariableMap).map(([envName, outputName]) => [outputName, readRequired(env, envName)])
  ) as unknown as FirebaseClientEnv;
}

export function describeFirebaseEnvPresence(env: EnvironmentSource = process.env): EnvPresence[] {
  return presenceVariableNames.map((name) => ({
    name,
    state: getPresenceState(env, name)
  }));
}

function collectMissingServerVariables(env: EnvironmentSource): string[] {
  const missing = ["FIREBASE_PROJECT_ID", "NEIS_API_KEY", "OPENAI_API_KEY"].filter((name) => !readOptional(env, name));
  if (!readOptional(env, "FIREBASE_SERVICE_ACCOUNT")) {
    if (!readOptional(env, "FIREBASE_CLIENT_EMAIL")) missing.splice(1, 0, "FIREBASE_CLIENT_EMAIL");
    if (!readOptional(env, "FIREBASE_PRIVATE_KEY")) missing.splice(missing.includes("FIREBASE_CLIENT_EMAIL") ? 2 : 1, 0, "FIREBASE_PRIVATE_KEY");
  }
  return orderServerMissingVariables(missing);
}

function orderServerMissingVariables(missing: string[]): string[] {
  const order = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "NEIS_API_KEY", "OPENAI_API_KEY"];
  return order.filter((name) => missing.includes(name));
}

function parseServiceAccount(value: string): Required<ServiceAccountShape> {
  const decoded = decodeServiceAccount(value);
  const parsed = JSON.parse(decoded) as ServiceAccountShape;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT must include client_email and private_key");
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key
  };
}

function decodeServiceAccount(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) return trimmed;

  return Buffer.from(trimmed, "base64").toString("utf8");
}

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n");
}

function readRequired(env: EnvironmentSource, name: string): string {
  const value = readOptional(env, name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readOptional(env: EnvironmentSource, name: string): string {
  return env[name]?.trim() ?? "";
}

function getPresenceState(env: EnvironmentSource, name: string): EnvPresenceState {
  if (!(name in env)) return "MISSING";
  return readOptional(env, name) ? "SET" : "EMPTY";
}
