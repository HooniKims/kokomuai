import type http from "node:http";
import type { ProviderEnvironment } from "./aiProviderRequest.js";
import { createApiHandler } from "./apiHandler.js";
import type { VerifyIdToken } from "./authContext.js";
import type { CurriculumIndex } from "./curriculumIndex.js";
import { getFileBackedCurriculumIndex } from "./curriculumRepository.js";
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "./firebaseAdmin.js";
import { parseFirebaseServerEnv } from "./firebaseEnv.js";
import { createFirebaseStore, type FirestoreLike } from "./firebaseStore.js";
import type { SchoolSearchDependency } from "./localApi.js";
import { searchNeisSchools } from "./neisSchoolSearch.js";
import { sendFirebasePasswordResetEmail } from "./passwordResetEmail.js";
import type { StorePort } from "./storePort.js";

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
