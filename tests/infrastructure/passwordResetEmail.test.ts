import { describe, expect, it } from "vitest";
import { buildFirebasePasswordResetRequest, sendFirebasePasswordResetEmail } from "../../server/passwordResetEmail";

describe("Firebase password reset email sender", () => {
  it("builds the Identity Toolkit password reset request without exposing passwords", () => {
    const request = buildFirebasePasswordResetRequest({
      apiKey: "firebase-web-key",
      email: " Teacher@Example.COM "
    });

    expect(request.url).toBe("https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=firebase-web-key");
    expect(request.init).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      }
    });
    expect(JSON.parse(request.init.body as string)).toEqual({
      requestType: "PASSWORD_RESET",
      email: "teacher@example.com"
    });
    expect(request.init.body as string).not.toContain("password");
  });

  it("sends the reset request through fetch and fails clearly when Firebase rejects it", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    await sendFirebasePasswordResetEmail(
      {
        apiKey: "firebase-web-key",
        email: "teacher@example.com"
      },
      {
        fetchImpl: async (url, init) => {
          calls.push({ url: String(url), body: String(init?.body ?? "") });
          return new Response(JSON.stringify({ email: "teacher@example.com" }), { status: 200 });
        }
      }
    );

    expect(calls).toEqual([
      {
        url: "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=firebase-web-key",
        body: JSON.stringify({
          requestType: "PASSWORD_RESET",
          email: "teacher@example.com"
        })
      }
    ]);

    await expect(
      sendFirebasePasswordResetEmail(
        {
          apiKey: "firebase-web-key",
          email: "missing@example.com"
        },
        {
          fetchImpl: async () =>
            new Response(JSON.stringify({ error: { message: "EMAIL_NOT_FOUND" } }), {
              status: 400
            })
        }
      )
    ).rejects.toThrow("Firebase password reset email request failed: EMAIL_NOT_FOUND");
  });
});
