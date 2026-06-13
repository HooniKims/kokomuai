import { describe, expect, it } from "vitest";
import {
  describeFirebaseEnvPresence,
  parseFirebaseClientEnv,
  parseFirebaseServerEnv
} from "../../server/firebaseEnv";

describe("firebaseEnv", () => {
  it("requires server-only Firebase, NEIS, and OpenAI variables without echoing values", () => {
    expect(() => parseFirebaseServerEnv({})).toThrow(
      "Missing required server environment variables: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, NEIS_API_KEY, OPENAI_API_KEY"
    );
  });

  it("parses split Firebase Admin credentials and normalizes private key newlines", () => {
    const env = parseFirebaseServerEnv({
      FIREBASE_PROJECT_ID: "kkokkomu-d6a4c",
      FIREBASE_CLIENT_EMAIL: "firebase-adminsdk@example.iam.gserviceaccount.com",
      FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
      NEIS_API_KEY: "neis-secret",
      OPENAI_API_KEY: "openai-secret"
    });

    expect(env).toEqual({
      projectId: "kkokkomu-d6a4c",
      credential: {
        type: "split",
        clientEmail: "firebase-adminsdk@example.iam.gserviceaccount.com",
        privateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n"
      },
      neisApiKey: "neis-secret",
      openAiApiKey: "openai-secret"
    });
  });

  it("parses a JSON Firebase service account when provided as a single env value", () => {
    const env = parseFirebaseServerEnv({
      FIREBASE_PROJECT_ID: "kkokkomu-d6a4c",
      FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
        client_email: "firebase-adminsdk@example.iam.gserviceaccount.com",
        private_key: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n"
      }),
      NEIS_API_KEY: "neis-secret",
      OPENAI_API_KEY: "openai-secret"
    });

    expect(env.credential).toEqual({
      type: "service_account",
      clientEmail: "firebase-adminsdk@example.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n"
    });
  });

  it("returns only presence states so secrets are not logged", () => {
    expect(
      describeFirebaseEnvPresence({
        FIREBASE_PROJECT_ID: "kkokkomu-d6a4c",
        FIREBASE_CLIENT_EMAIL: "firebase-adminsdk@example.iam.gserviceaccount.com",
        FIREBASE_PRIVATE_KEY: "private-key-secret",
        NEIS_API_KEY: "neis-secret",
        OPENAI_API_KEY: "openai-secret",
        VITE_FIREBASE_API_KEY: "client-api-key"
      })
    ).toEqual([
      { name: "FIREBASE_PROJECT_ID", state: "SET" },
      { name: "FIREBASE_CLIENT_EMAIL", state: "SET" },
      { name: "FIREBASE_PRIVATE_KEY", state: "SET" },
      { name: "FIREBASE_SERVICE_ACCOUNT", state: "MISSING" },
      { name: "NEIS_API_KEY", state: "SET" },
      { name: "OPENAI_API_KEY", state: "SET" },
      { name: "KKOKKOMU_ADMIN_EMAILS", state: "MISSING" },
      { name: "VITE_FIREBASE_API_KEY", state: "SET" },
      { name: "VITE_FIREBASE_AUTH_DOMAIN", state: "MISSING" },
      { name: "VITE_FIREBASE_PROJECT_ID", state: "MISSING" },
      { name: "VITE_FIREBASE_APP_ID", state: "MISSING" },
      { name: "VITE_FIREBASE_STORAGE_BUCKET", state: "MISSING" },
      { name: "VITE_FIREBASE_MESSAGING_SENDER_ID", state: "MISSING" }
    ]);
  });

  it("parses complete client Firebase config from Vite variables", () => {
    expect(
      parseFirebaseClientEnv({
        VITE_FIREBASE_API_KEY: "client-api-key",
        VITE_FIREBASE_AUTH_DOMAIN: "kkokkomu-d6a4c.firebaseapp.com",
        VITE_FIREBASE_PROJECT_ID: "kkokkomu-d6a4c",
        VITE_FIREBASE_APP_ID: "1:965823913795:web:abc",
        VITE_FIREBASE_STORAGE_BUCKET: "kkokkomu-d6a4c.appspot.com",
        VITE_FIREBASE_MESSAGING_SENDER_ID: "965823913795"
      })
    ).toEqual({
      apiKey: "client-api-key",
      authDomain: "kkokkomu-d6a4c.firebaseapp.com",
      projectId: "kkokkomu-d6a4c",
      appId: "1:965823913795:web:abc",
      storageBucket: "kkokkomu-d6a4c.appspot.com",
      messagingSenderId: "965823913795"
    });
  });
});
