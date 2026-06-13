import { describe, expect, it } from "vitest";
import { approveTeachers, createPasswordResetAction, registerTeacher } from "../../src/domain/teacher/teacherAccount";

const selectedSchool = {
  schoolName: "새빛초등학교",
  schoolKind: "초등학교",
  officeCode: "B10",
  standardSchoolCode: "1234567",
  region: "서울"
};

describe("teacherAccount", () => {
  it("registers a teacher as pending with real name and selected school", () => {
    const teacher = registerTeacher(
      {
        realName: "김하늘",
        email: "teacher@example.com",
        loginProvider: "password",
        school: selectedSchool
      },
      { id: "teacher-1", now: "2026-06-11T10:00:00.000Z" }
    );

    expect(teacher.status).toBe("pending");
    expect(teacher.realName).toBe("김하늘");
    expect(teacher.displayName).toBe("");
    expect(teacher.school.standardSchoolCode).toBe("1234567");
    expect(teacher.createdAt).toBe("2026-06-11T10:00:00.000Z");
  });

  it("approves selected teachers in bulk without exposing student data", () => {
    const pending = registerTeacher(
      {
        realName: "김하늘",
        email: "teacher@example.com",
        loginProvider: "google",
        school: selectedSchool
      },
      { id: "teacher-1", now: "2026-06-11T10:00:00.000Z" }
    );

    const approved = approveTeachers([pending], ["teacher-1"], {
      adminId: "admin-1",
      now: "2026-06-11T11:00:00.000Z"
    });

    expect(approved[0].status).toBe("approved");
    expect(approved[0].approvedBy).toBe("admin-1");
    expect(approved[0].approvedAt).toBe("2026-06-11T11:00:00.000Z");
    expect(JSON.stringify(approved[0])).not.toContain("student");
  });

  it("creates a reset email action instead of setting a new password", () => {
    const action = createPasswordResetAction({
      teacherId: "teacher-1",
      email: "teacher@example.com",
      adminId: "admin-1",
      now: "2026-06-11T12:00:00.000Z"
    });

    expect(action.type).toBe("send_password_reset_email");
    expect(action.email).toBe("teacher@example.com");
    expect(action).not.toHaveProperty("newPassword");
  });
});
