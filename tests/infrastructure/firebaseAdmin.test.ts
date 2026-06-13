import { describe, expect, it } from "vitest";
import { buildFirebaseAdminAppOptions } from "../../server/firebaseAdmin";

describe("firebaseAdmin", () => {
  it("builds Firebase Admin app options from server-only environment values", () => {
    expect(
      buildFirebaseAdminAppOptions({
        FIREBASE_PROJECT_ID: "kkokkomu-d6a4c",
        FIREBASE_CLIENT_EMAIL: "firebase-adminsdk@example.iam.gserviceaccount.com",
        FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
        NEIS_API_KEY: "neis-secret",
        OPENAI_API_KEY: "openai-secret"
      })
    ).toEqual({
      projectId: "kkokkomu-d6a4c",
      credential: {
        projectId: "kkokkomu-d6a4c",
        clientEmail: "firebase-adminsdk@example.iam.gserviceaccount.com",
        privateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n"
      }
    });
  });
});
