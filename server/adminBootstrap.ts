import { promoteTeacherToAdmin, type IdentityTeacherAccount } from "../src/domain/identity/identityAccess";

type EnvironmentSource = Record<string, string | undefined>;

export function parseBootstrapAdminEmails(value: string | undefined): string[] {
  return Array.from(
    new Set(
      (value ?? "")
        .split(/[,\n;]/)
        .map((email) => normalizeEmail(email))
        .filter(Boolean)
    )
  );
}

export function isBootstrapAdminEmail(email: string | undefined, env: EnvironmentSource = process.env): boolean {
  const normalized = normalizeEmail(email ?? "");
  if (!normalized) return false;
  return parseBootstrapAdminEmails(env.KKOKKOMU_ADMIN_EMAILS).includes(normalized);
}

export function promoteBootstrapAdminProfile(
  teacher: IdentityTeacherAccount,
  options: {
    now: string;
    logId: string;
  }
) {
  return promoteTeacherToAdmin(teacher, {
    adminId: "bootstrap-env",
    now: options.now,
    logId: options.logId
  });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
