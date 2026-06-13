import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  requireAdminAuth,
  requireTeacherFeatureAuth,
  resolveRequestAuthContext
} from "../../server/authContext";
import { createLocalStore } from "../../server/localStore";
import { approveTeacher, registerLocalTeacher } from "../../src/domain/identity/identityAccess";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("authContext", () => {
  it("keeps student share requests anonymous when no Authorization header is present", async () => {
    const store = createLocalStore(await tempStorePath());

    await expect(
      resolveRequestAuthContext({
        authorizationHeader: undefined,
        store,
        verifyIdToken: async () => {
          throw new Error("token verifier should not be called");
        }
      })
    ).resolves.toEqual({ kind: "anonymous" });
  });

  it("resolves an approved teacher from a Firebase ID token", async () => {
    const store = createLocalStore(await tempStorePath());
    const teacher = approveTeacher(
      registerLocalTeacher(
        {
          realName: "김하늘",
          email: "teacher@example.com",
          passwordHash: "firebase-auth",
          school: {
            schoolName: "새빛중학교",
            schoolKind: "중학교",
            officeCode: "B10",
            standardSchoolCode: "1234567",
            region: "서울"
          }
        },
        { id: "firebase-uid-1", now: "2026-06-13T01:20:00.000Z" }
      ),
      { adminId: "local-admin", now: "2026-06-13T01:21:00.000Z", logId: "admin-log-1" }
    ).teacher;
    await store.saveTeacher(teacher);

    const context = await resolveRequestAuthContext({
      authorizationHeader: "Bearer firebase-token",
      store,
      verifyIdToken: async (token) => ({ uid: token === "firebase-token" ? "firebase-uid-1" : "missing" })
    });

    expect(requireTeacherFeatureAuth(context).id).toBe("firebase-uid-1");
  });

  it("rejects pending teachers from teacher features and non-admins from admin features", async () => {
    const store = createLocalStore(await tempStorePath());
    const pendingTeacher = registerLocalTeacher(
      {
        realName: "김하늘",
        email: "teacher@example.com",
        passwordHash: "firebase-auth",
        school: {
          schoolName: "새빛중학교",
          schoolKind: "중학교",
          officeCode: "B10",
          standardSchoolCode: "1234567",
          region: "서울"
        }
      },
      { id: "firebase-uid-1", now: "2026-06-13T01:20:00.000Z" }
    );
    await store.saveTeacher(pendingTeacher);

    const context = await resolveRequestAuthContext({
      authorizationHeader: "Bearer firebase-token",
      store,
      verifyIdToken: async () => ({ uid: "firebase-uid-1" })
    });

    expect(() => requireTeacherFeatureAuth(context)).toThrow("teacher_not_approved");
    expect(() => requireAdminAuth(context)).toThrow("admin_not_allowed");
  });

  it("accepts admins for admin routes", async () => {
    const store = createLocalStore(await tempStorePath());

    const context = await resolveRequestAuthContext({
      authorizationHeader: "Bearer admin-token",
      store,
      verifyIdToken: async () => ({ uid: "local-admin" })
    });

    expect(requireAdminAuth(context).id).toBe("local-admin");
  });
});

async function tempStorePath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "auth-context-"));
  tempRoots.push(root);
  return join(root, "store.json");
}
