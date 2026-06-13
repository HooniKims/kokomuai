import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { parseFirebaseServerEnv } from "./firebaseEnv";
import type { FirestoreLike } from "./firebaseStore";

type EnvironmentSource = Record<string, string | undefined>;

export interface FirebaseAdminAppOptions {
  projectId: string;
  credential: {
    projectId: string;
    clientEmail: string;
    privateKey: string;
  };
}

export function buildFirebaseAdminAppOptions(env: EnvironmentSource = process.env): FirebaseAdminAppOptions {
  const parsed = parseFirebaseServerEnv(env);
  return {
    projectId: parsed.projectId,
    credential: {
      projectId: parsed.projectId,
      clientEmail: parsed.credential.clientEmail,
      privateKey: parsed.credential.privateKey
    }
  };
}

export function getFirebaseAdminApp(env: EnvironmentSource = process.env): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const options = buildFirebaseAdminAppOptions(env);
  return initializeApp({
    projectId: options.projectId,
    credential: cert(options.credential)
  });
}

export function getFirebaseAdminFirestore(env: EnvironmentSource = process.env): FirestoreLike {
  return getFirestore(getFirebaseAdminApp(env)) as unknown as FirestoreLike;
}

export function getFirebaseAdminAuth(env: EnvironmentSource = process.env) {
  return getAuth(getFirebaseAdminApp(env));
}
