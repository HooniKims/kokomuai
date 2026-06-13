export type TeacherLoginProvider = "password" | "google";
export type TeacherStatus = "pending" | "approved" | "rejected" | "disabled" | "admin";

export interface SelectedSchool {
  schoolName: string;
  schoolKind: string;
  officeCode: string;
  standardSchoolCode: string;
  region: string;
}

export interface TeacherAccount {
  id: string;
  realName: string;
  displayName: string;
  email: string;
  loginProvider: TeacherLoginProvider;
  school: SelectedSchool;
  status: TeacherStatus;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
}

export interface RegisterTeacherInput {
  realName: string;
  email: string;
  loginProvider: TeacherLoginProvider;
  school: SelectedSchool;
}

export function registerTeacher(input: RegisterTeacherInput, options: { id: string; now: string }): TeacherAccount {
  return {
    id: options.id,
    realName: input.realName.trim(),
    displayName: "",
    email: input.email.trim().toLowerCase(),
    loginProvider: input.loginProvider,
    school: input.school,
    status: "pending",
    createdAt: options.now
  };
}

export function approveTeachers(
  teachers: TeacherAccount[],
  selectedIds: string[],
  options: { adminId: string; now: string }
): TeacherAccount[] {
  const idSet = new Set(selectedIds);

  return teachers.map((teacher) => {
    if (!idSet.has(teacher.id) || teacher.status !== "pending") {
      return teacher;
    }

    return {
      ...teacher,
      status: "approved",
      approvedAt: options.now,
      approvedBy: options.adminId
    };
  });
}

export interface PasswordResetAction {
  type: "send_password_reset_email";
  teacherId: string;
  email: string;
  adminId: string;
  createdAt: string;
}

export function createPasswordResetAction(input: {
  teacherId: string;
  email: string;
  adminId: string;
  now: string;
}): PasswordResetAction {
  return {
    type: "send_password_reset_email",
    teacherId: input.teacherId,
    email: input.email.trim().toLowerCase(),
    adminId: input.adminId,
    createdAt: input.now
  };
}
