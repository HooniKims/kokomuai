import { describe, expect, it } from "vitest";
import { isBootstrapAdminEmail, parseBootstrapAdminEmails } from "../../server/adminBootstrap";

describe("adminBootstrap", () => {
  it("normalizes configured bootstrap admin emails", () => {
    expect(parseBootstrapAdminEmails(" Admin@Example.com,admin@example.com\nsecond@example.com; ")).toEqual([
      "admin@example.com",
      "second@example.com"
    ]);
  });

  it("matches Firebase token email against the configured admin allowlist", () => {
    expect(isBootstrapAdminEmail("ADMIN@example.com", { KKOKKOMU_ADMIN_EMAILS: "admin@example.com" })).toBe(true);
    expect(isBootstrapAdminEmail("teacher@example.com", { KKOKKOMU_ADMIN_EMAILS: "admin@example.com" })).toBe(false);
    expect(isBootstrapAdminEmail(undefined, { KKOKKOMU_ADMIN_EMAILS: "admin@example.com" })).toBe(false);
  });
});
