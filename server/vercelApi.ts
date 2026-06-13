import type http from "node:http";
import type { ProviderEnvironment } from "./aiProviderRequest";
import { createApiHandler } from "./apiHandler";
import type { VerifyIdToken } from "./authContext";
import type { CurriculumIndex } from "./curriculumIndex";
import { getFileBackedCurriculumIndex } from "./curriculumRepository";
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "./firebaseAdmin";
import { parseFirebaseServerEnv } from "./firebaseEnv";
import { createFirebaseStore, type FirestoreLike } from "./firebaseStore";
import type { SchoolSearchDependency } from "./localApi";
import { searchNeisSchools } from "./neisSchoolSearch";
import { sendFirebasePasswordResetEmail } from "./passwordResetEmail";
import type { StorePort } from "./storePort";

type EnvironmentSource = ProviderEnvironment & Record<string, string | undefined>;

export interface VercelApiDependencies {
  store?: StorePort;
  firestore?: FirestoreLike;
  curriculumIndex?: CurriculumIndex;
  schoolSearch?: SchoolSearchDependency;
  env?: EnvironmentSource;
  fetchImpl?: typeof fetch;
  auth?: {
    requireFirebaseAuth: boolean;
    verifyIdToken: VerifyIdToken;
  };
  passwordResetEmail?: (email: string) => Promise<void>;
}

export async function createVercelApiHandler(dependencies: VercelApiDependencies = {}): Promise<http.RequestListener> {
  const env = dependencies.env ?? process.env;
  const parsedServerEnv = dependencies.store && dependencies.schoolSearch ? undefined : parseFirebaseServerEnv(env);
  const store = dependencies.store ?? createFirebaseStore(dependencies.firestore ?? getFirebaseAdminFirestore(env));
  const curriculumIndex = dependencies.curriculumIndex ?? (dependencies.store ? undefined : await getFileBackedCurriculumIndex());
  const schoolSearch =
    dependencies.schoolSearch ??
    ((query: string) => searchNeisSchools({ query, apiKey: parsedServerEnv?.neisApiKey ?? parseFirebaseServerEnv(env).neisApiKey }));
  const auth =
    dependencies.auth ??
    (dependencies.store
      ? undefined
      : {
          requireFirebaseAuth: true,
          verifyIdToken: async (token: string) => {
            const decoded = await getFirebaseAdminAuth(env).verifyIdToken(token);
            return {
              uid: decoded.uid,
              email: decoded.email
            };
          }
        });

  return createApiHandler({
    store,
    curriculumIndex,
    schoolSearch,
    env,
    fetchImpl: dependencies.fetchImpl,
    auth,
    passwordResetEmail:
      dependencies.passwordResetEmail ??
      ((email: string) =>
        sendFirebasePasswordResetEmail(
          {
            email,
            apiKey: env.VITE_FIREBASE_API_KEY ?? ""
          },
          { fetchImpl: dependencies.fetchImpl }
        ))
  });
}
