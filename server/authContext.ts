import { canUseTeacherFeatures, type IdentityTeacherAccount } from "../src/domain/identity/identityAccess.js";
import type { StorePort } from "./storePort.js";

export interface VerifiedFirebaseToken {
  uid: string;
  email?: string;
}

export type VerifyIdToken = (token: string) => Promise<VerifiedFirebaseToken>;

export type RequestAuthContext =
  | {
      kind: "anonymous";
    }
  | {
      kind: "teacher";
      uid: string;
      teacher: IdentityTeacherAccount;
    };

export interface ResolveRequestAuthContextInput {
  authorizationHeader?: string;
  store: StorePort;
  verifyIdToken: VerifyIdToken;
}

export async function resolveRequestAuthContext(input: ResolveRequestAuthContextInput): Promise<RequestAuthContext> {
  const token = parseBearerToken(input.authorizationHeader);
  if (!token) return { kind: "anonymous" };

  const verified = await input.verifyIdToken(token);
  const teacher = await input.store.getTeacher(verified.uid);
  if (!teacher) {
    throw new Error("teacher_profile_not_found");
  }

  return {
    kind: "teacher",
    uid: verified.uid,
    teacher
  };
}

export function requireTeacherFeatureAuth(context: RequestAuthContext): IdentityTeacherAccount {
  if (context.kind !== "teacher") {
    throw new Error("auth_required");
  }

  if (!canUseTeacherFeatures(context.teacher)) {
    throw new Error("teacher_not_approved");
  }

  return context.teacher;
}

export function requireAdminAuth(context: RequestAuthContext): IdentityTeacherAccount {
  if (context.kind !== "teacher" || context.teacher.status !== "admin") {
    throw new Error("admin_not_allowed");
  }

  return context.teacher;
}

function parseBearerToken(value: string | undefined): string {
  if (!value) return "";
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1]?.trim() ?? "";
}
