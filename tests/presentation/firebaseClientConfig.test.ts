import { describe, expect, it } from "vitest";
import { isFirebaseTeacherAuthEnabled, readFirebaseClientConfig } from "../../src/infrastructure/firebase/client";

describe("firebase client config", () => {
  it("reads only browser-safe Vite Firebase variables", () => {
    expect(
      readFirebaseClientConfig({
        VITE_FIREBASE_API_KEY: "client-api-key",
        VITE_FIREBASE_AUTH_DOMAIN: "kkokkomu-d6a4c.firebaseapp.com",
        VITE_FIREBASE_PROJECT_ID: "kkokkomu-d6a4c",
        VITE_FIREBASE_APP_ID: "1:965823913795:web:abc",
        VITE_FIREBASE_STORAGE_BUCKET: "kkokkomu-d6a4c.appspot.com",
        VITE_FIREBASE_MESSAGING_SENDER_ID: "965823913795",
        FIREBASE_PRIVATE_KEY: "server-secret"
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

  it("returns null until all Firebase client variables are configured", () => {
    expect(readFirebaseClientConfig({ VITE_FIREBASE_PROJECT_ID: "kkokkomu-d6a4c" })).toBeNull();
  });

  it("requires an explicit flag before Firebase teacher auth takes over local screens", () => {
    expect(isFirebaseTeacherAuthEnabled({ VITE_FIREBASE_AUTH_ENABLED: "true" })).toBe(true);
    expect(isFirebaseTeacherAuthEnabled({ VITE_FIREBASE_AUTH_ENABLED: "1" })).toBe(true);
    expect(isFirebaseTeacherAuthEnabled({ VITE_FIREBASE_AUTH_ENABLED: "false" })).toBe(false);
    expect(isFirebaseTeacherAuthEnabled({ VITE_FIREBASE_API_KEY: "client-api-key" })).toBe(false);
  });
});
