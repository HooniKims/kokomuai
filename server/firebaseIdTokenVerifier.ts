import type { VerifiedFirebaseToken } from "./authContext.js";

export interface FirebaseIdTokenLookupInput {
  apiKey: string;
  token: string;
}

export interface FirebaseIdTokenVerifierDependencies {
  fetchImpl?: typeof fetch;
}

export function buildFirebaseIdTokenLookupRequest(input: FirebaseIdTokenLookupInput): {
  url: string;
  init: RequestInit;
} {
  if (!input.apiKey) {
    throw new Error("VITE_FIREBASE_API_KEY is required to verify Firebase ID tokens");
  }
  return {
    url: `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(input.apiKey)}`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ idToken: input.token }),
    },
  };
}

export async function verifyFirebaseIdTokenWithIdentityToolkit(
  input: FirebaseIdTokenLookupInput,
  dependencies: FirebaseIdTokenVerifierDependencies = {},
): Promise<VerifiedFirebaseToken> {
  const request = buildFirebaseIdTokenLookupRequest(input);
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const response = await fetchImpl(request.url, request.init);
  const payload = (await response.json().catch(() => null)) as
    | {
        users?: Array<{ localId?: string; email?: string }>;
        error?: { message?: string };
      }
    | null;

  if (!response.ok) {
    throw new Error(
      `Firebase ID token lookup failed: ${payload?.error?.message ?? response.status}`,
    );
  }

  const user = payload?.users?.[0];
  if (!user?.localId) {
    throw new Error("Firebase ID token lookup failed: USER_NOT_FOUND");
  }

  return {
    uid: user.localId,
    email: user.email,
  };
}
