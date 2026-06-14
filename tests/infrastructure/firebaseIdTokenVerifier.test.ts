import { describe, expect, it } from "vitest";
import {
  buildFirebaseIdTokenLookupRequest,
  verifyFirebaseIdTokenWithIdentityToolkit,
} from "../../server/firebaseIdTokenVerifier";

describe("Firebase ID token verifier", () => {
  it("verifies a Firebase ID token through Identity Toolkit lookup", async () => {
    const calls: Array<{ url: string; body: string }> = [];

    const result = await verifyFirebaseIdTokenWithIdentityToolkit(
      {
        apiKey: "firebase-web-key",
        token: "firebase-id-token",
      },
      {
        fetchImpl: async (url, init) => {
          calls.push({ url: String(url), body: String(init?.body ?? "") });
          return new Response(
            JSON.stringify({
              users: [{ localId: "firebase-uid-1", email: "teacher@example.com" }],
            }),
            { status: 200 },
          );
        },
      },
    );

    expect(result).toEqual({
      uid: "firebase-uid-1",
      email: "teacher@example.com",
    });
    expect(calls).toEqual([
      {
        url: "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=firebase-web-key",
        body: JSON.stringify({ idToken: "firebase-id-token" }),
      },
    ]);
  });

  it("fails without exposing token values when Firebase rejects lookup", async () => {
    await expect(
      verifyFirebaseIdTokenWithIdentityToolkit(
        {
          apiKey: "firebase-web-key",
          token: "secret-token",
        },
        {
          fetchImpl: async () =>
            new Response(
              JSON.stringify({ error: { message: "INVALID_ID_TOKEN" } }),
              { status: 400 },
            ),
        },
      ),
    ).rejects.toThrow("Firebase ID token lookup failed: INVALID_ID_TOKEN");
  });
});

describe("buildFirebaseIdTokenLookupRequest", () => {
  it("builds the lookup request without placing the ID token in the URL", () => {
    const request = buildFirebaseIdTokenLookupRequest({
      apiKey: "firebase-web-key",
      token: "firebase-id-token",
    });

    expect(request.url).toBe(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=firebase-web-key",
    );
    expect(request.url).not.toContain("firebase-id-token");
    expect(request.init).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  });
});
