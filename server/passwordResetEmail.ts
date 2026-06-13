export interface FirebasePasswordResetRequestInput {
  apiKey: string;
  email: string;
}

export interface FirebasePasswordResetRequest {
  url: string;
  init: RequestInit;
}

export function buildFirebasePasswordResetRequest(input: FirebasePasswordResetRequestInput): FirebasePasswordResetRequest {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error("VITE_FIREBASE_API_KEY is required to send password reset emails");

  return {
    url: `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        requestType: "PASSWORD_RESET",
        email: input.email.trim().toLowerCase()
      })
    }
  };
}

export async function sendFirebasePasswordResetEmail(
  input: FirebasePasswordResetRequestInput,
  dependencies: { fetchImpl?: typeof fetch } = {}
): Promise<void> {
  const request = buildFirebasePasswordResetRequest(input);
  const response = await (dependencies.fetchImpl ?? fetch)(request.url, request.init);

  if (!response.ok) {
    const message = await readFirebaseErrorMessage(response);
    throw new Error(`Firebase password reset email request failed: ${message}`);
  }
}

async function readFirebaseErrorMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return payload?.error?.message ?? `${response.status}`;
}
