import { describe, expect, it } from "vitest";
import {
  approveTeacher,
  canUseTeacherFeatures,
  createPasswordResetAction,
  disableTeacher,
  promoteTeacherToAdmin,
  registerLocalTeacher,
  rejectTeacher
} from "../../src/domain/identity/identityAccess";

const selectedSchool = {
  schoolName: "한빛초등학교",
  schoolKind: "초등학교",
  officeCode: "B10",
  standardSchoolCode: "1234567",
  region: "서울"
};

const pendingTeacher = () =>
  registerLocalTeacher(
    {
      realName: "김하늘",
      email: " Teacher@Example.COM ",
      passwordHash: "argon2id$hashed-password",
      school: selectedSchool
    },
    { id: "teacher-1", now: "2026-06-11T10:00:00.000Z" }
  );

describe("identityAccess", () => {
  it("registers a local teacher as pending without storing a plain password", () => {
    const teacher = pendingTeacher();

    expect(teacher).toMatchObject({
      id: "teacher-1",
      realName: "김하늘",
      displayName: "",
      email: "teacher@example.com",
      loginProvider: "password",
      passwordHash: "argon2id$hashed-password",
      status: "pending",
      createdAt: "2026-06-11T10:00:00.000Z",
      school: selectedSchool
    });
    expect(teacher).not.toHaveProperty("password");
    expect(JSON.stringify(teacher)).not.toContain("plain-teacher-password");
  });

  it("approves a pending teacher and records a student-data-free admin log event", () => {
    const { teacher, event } = approveTeacher(pendingTeacher(), {
      adminId: "admin-1",
      now: "2026-06-11T11:00:00.000Z",
      logId: "log-1"
    });

    expect(teacher.status).toBe("approved");
    expect(teacher.approvedBy).toBe("admin-1");
    expect(teacher.approvedAt).toBe("2026-06-11T11:00:00.000Z");
    expect(event).toEqual({
      id: "log-1",
      type: "admin_action_logged",
      action: "teacher_approved",
      adminId: "admin-1",
      targetTeacherId: "teacher-1",
      createdAt: "2026-06-11T11:00:00.000Z"
    });
    expect(JSON.stringify(event)).not.toContain("student");
  });

  it("rejects a pending teacher with a reason", () => {
    const { teacher, event } = rejectTeacher(pendingTeacher(), {
      adminId: "admin-1",
      now: "2026-06-11T11:10:00.000Z",
      logId: "log-2",
      reason: "학교 정보 확인 필요"
    });

    expect(teacher.status).toBe("rejected");
    expect(teacher.rejectedBy).toBe("admin-1");
    expect(teacher.rejectedAt).toBe("2026-06-11T11:10:00.000Z");
    expect(teacher.rejectionReason).toBe("학교 정보 확인 필요");
    expect(event.action).toBe("teacher_rejected");
    expect(event.reason).toBe("rejection_reason_recorded_on_teacher");
  });

  it("does not store free-form rejection reasons in admin log events", () => {
    const { teacher, event } = rejectTeacher(pendingTeacher(), {
      adminId: "admin-1",
      now: "2026-06-11T11:10:00.000Z",
      logId: "log-2",
      reason: "민수에게 들은 말: 오늘 집에서 있었던 일을 그대로 적음"
    });

    expect(teacher.rejectionReason).toBe("민수에게 들은 말: 오늘 집에서 있었던 일을 그대로 적음");
    expect(event.reason).toBe("rejection_reason_recorded_on_teacher");
    expect(JSON.stringify(event)).not.toContain("민수");
    expect(JSON.stringify(event)).not.toContain("집에서 있었던 일");
    expect(JSON.stringify(event)).not.toContain("그대로 적음");
  });

  it("disables a teacher while ignoring student raw data passed by mistake", () => {
    const approved = approveTeacher(pendingTeacher(), {
      adminId: "admin-1",
      now: "2026-06-11T11:00:00.000Z",
      logId: "log-1"
    }).teacher;

    const { teacher, event } = disableTeacher(approved, {
      adminId: "admin-1",
      now: "2026-06-11T12:00:00.000Z",
      logId: "log-3",
      studentName: "학생이름",
      studentConversation: "학생 원문"
    } as Parameters<typeof disableTeacher>[1] & Record<string, string>);

    expect(teacher.status).toBe("disabled");
    expect(teacher.disabledBy).toBe("admin-1");
    expect(teacher.disabledAt).toBe("2026-06-11T12:00:00.000Z");
    expect(event.action).toBe("teacher_disabled");
    expect(JSON.stringify(event)).not.toContain("학생이름");
    expect(JSON.stringify(event)).not.toContain("학생 원문");
    expect(JSON.stringify(event)).not.toContain("studentConversation");
  });

  it("promotes an approved teacher to admin", () => {
    const approved = approveTeacher(pendingTeacher(), {
      adminId: "admin-1",
      now: "2026-06-11T11:00:00.000Z",
      logId: "log-1"
    }).teacher;

    const { teacher, event } = promoteTeacherToAdmin(approved, {
      adminId: "admin-1",
      now: "2026-06-11T13:00:00.000Z",
      logId: "log-4"
    });

    expect(teacher.status).toBe("admin");
    expect(teacher.promotedBy).toBe("admin-1");
    expect(teacher.promotedAt).toBe("2026-06-11T13:00:00.000Z");
    expect(event.action).toBe("teacher_promoted_to_admin");
  });

  it("creates a password reset action instead of setting or exposing a password", () => {
    const { action, event } = createPasswordResetAction({
      teacherId: "teacher-1",
      email: " Teacher@Example.COM ",
      adminId: "admin-1",
      now: "2026-06-11T14:00:00.000Z",
      actionId: "reset-1",
      logId: "log-5"
    });

    expect(action).toEqual({
      id: "reset-1",
      type: "send_password_reset_email",
      teacherId: "teacher-1",
      email: "teacher@example.com",
      adminId: "admin-1",
      createdAt: "2026-06-11T14:00:00.000Z"
    });
    expect(action).not.toHaveProperty("password");
    expect(action).not.toHaveProperty("newPassword");
    expect(action).not.toHaveProperty("passwordHash");
    expect(event.action).toBe("password_reset_requested");
  });

  it("allows only approved teachers and admins to use teacher features", () => {
    const pending = pendingTeacher();
    const approved = approveTeacher(pending, {
      adminId: "admin-1",
      now: "2026-06-11T11:00:00.000Z",
      logId: "log-1"
    }).teacher;
    const rejected = rejectTeacher(pending, {
      adminId: "admin-1",
      now: "2026-06-11T11:10:00.000Z",
      logId: "log-2",
      reason: "학교 정보 확인 필요"
    }).teacher;
    const disabled = disableTeacher(approved, {
      adminId: "admin-1",
      now: "2026-06-11T12:00:00.000Z",
      logId: "log-3"
    }).teacher;
    const admin = promoteTeacherToAdmin(approved, {
      adminId: "admin-1",
      now: "2026-06-11T13:00:00.000Z",
      logId: "log-4"
    }).teacher;

    expect(canUseTeacherFeatures(pending)).toBe(false);
    expect(canUseTeacherFeatures(rejected)).toBe(false);
    expect(canUseTeacherFeatures(disabled)).toBe(false);
    expect(canUseTeacherFeatures(approved)).toBe(true);
    expect(canUseTeacherFeatures(admin)).toBe(true);
  });
});
