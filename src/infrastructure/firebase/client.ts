import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  type Auth,
  type User
} from "firebase/auth";

type FirebaseClientEnvironment = Record<string, string | undefined>;

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket: string;
  messagingSenderId: string;
}

const clientEnvMap = {
  VITE_FIREBASE_API_KEY: "apiKey",
  VITE_FIREBASE_AUTH_DOMAIN: "authDomain",
  VITE_FIREBASE_PROJECT_ID: "projectId",
  VITE_FIREBASE_APP_ID: "appId",
  VITE_FIREBASE_STORAGE_BUCKET: "storageBucket",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "messagingSenderId"
} as const;

export function readFirebaseClientConfig(env: FirebaseClientEnvironment = getImportMetaEnv()): FirebaseClientConfig | null {
  const entries = Object.entries(clientEnvMap).map(([envName, outputName]) => {
    const value = env[envName]?.trim();
    return value ? [outputName, value] : null;
  });

  if (entries.some((entry) => entry === null)) return null;
  return Object.fromEntries(entries as Array<[string, string]>) as unknown as FirebaseClientConfig;
}

export function isFirebaseClientConfigured(env: FirebaseClientEnvironment = getImportMetaEnv()): boolean {
  return readFirebaseClientConfig(env) !== null;
}

export function isFirebaseTeacherAuthEnabled(env: FirebaseClientEnvironment = getImportMetaEnv()): boolean {
  const value = env.VITE_FIREBASE_AUTH_ENABLED?.trim().toLowerCase();
  return value === "true" || value === "1";
}

export function getKkokkomuFirebaseApp(config: FirebaseClientConfig | null = readFirebaseClientConfig()): FirebaseApp {
  if (!config) {
    throw new Error("Firebase client config is not configured");
  }

  return getApps()[0] ?? initializeApp(config as FirebaseOptions);
}

export function getKkokkomuFirebaseAuth(app: FirebaseApp = getKkokkomuFirebaseApp()): Auth {
  return getAuth(app);
}

export async function signUpTeacherWithEmail(auth: Auth, email: string, password: string): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signInTeacherWithEmail(auth: Auth, email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signInTeacherWithGoogle(auth: Auth): Promise<User> {
  const credential = await signInWithPopup(auth, new GoogleAuthProvider());
  return credential.user;
}

export async function updateCurrentTeacherPassword(auth: Auth, newPassword: string): Promise<void> {
  if (!auth.currentUser) throw new Error("auth_required");
  await updatePassword(auth.currentUser, newPassword);
}

export async function deleteCurrentTeacherAuthUser(auth: Auth): Promise<void> {
  if (!auth.currentUser) throw new Error("auth_required");
  await deleteUser(auth.currentUser);
}

export function listenToTeacherAuth(auth: Auth, listener: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, listener);
}

export function createFirebaseAuthTokenProvider(auth: Auth = getKkokkomuFirebaseAuth()) {
  return async (forceRefresh = false) => auth.currentUser?.getIdToken(forceRefresh) ?? null;
}

export function signOutTeacher(auth: Auth): Promise<void> {
  return signOut(auth);
}

function getImportMetaEnv(): FirebaseClientEnvironment {
  return ((import.meta as unknown as { env?: FirebaseClientEnvironment }).env ?? {}) as FirebaseClientEnvironment;
}
