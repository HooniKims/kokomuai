export type TeacherLoginProvider = "password" | "google";
export type IdentityTeacherStatus = "pending" | "approved" | "rejected" | "disabled" | "admin";

export interface IdentitySchool {
  schoolName: string;
  schoolKind: string;
  officeCode: string;
  standardSchoolCode: string;
  region: string;
  address?: string;
}

export interface IdentityTeacherAccount {
  id: string;
  realName: string;
  displayName: string;
  email: string;
  loginProvider: TeacherLoginProvider;
  passwordHash: string;
  school: IdentitySchool;
  status: IdentityTeacherStatus;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  disabledAt?: string;
  disabledBy?: string;
  promotedAt?: string;
  promotedBy?: string;
}

export interface RegisterLocalTeacherInput {
  realName: string;
  email: string;
  passwordHash: string;
  school: IdentitySchool;
}

export type AdminAction =
  | "teacher_approved"
  | "teacher_rejected"
  | "teacher_disabled"
  | "teacher_promoted_to_admin"
  | "password_reset_requested"
  | "chatbot_disabled";

export interface AdminActionLogEvent {
  id: string;
  type: "admin_action_logged";
  action: AdminAction;
  adminId: string;
  targetTeacherId: string;
  targetChatbotId?: string;
  createdAt: string;
  reason?: string;
}

export interface TeacherAdminActionResult {
  teacher: IdentityTeacherAccount;
  event: AdminActionLogEvent;
}

export interface PasswordResetAction {
  id: string;
  type: "send_password_reset_email";
  teacherId: string;
  email: string;
  adminId: string;
  createdAt: string;
}

export interface PasswordResetActionResult {
  action: PasswordResetAction;
  event: AdminActionLogEvent;
}

interface AdminActionOptions {
  adminId: string;
  now: string;
  logId: string;
}

interface RejectTeacherOptions extends AdminActionOptions {
  reason: string;
}

export function registerLocalTeacher(
  input: RegisterLocalTeacherInput,
  options: { id: string; now: string }
): IdentityTeacherAccount {
  return {
    id: options.id,
    realName: input.realName.trim(),
    displayName: "",
    email: normalizeEmail(input.email),
    loginProvider: "password",
    passwordHash: input.passwordHash,
    school: { ...input.school },
    status: "pending",
    createdAt: options.now
  };
}

export function approveTeacher(
  teacher: IdentityTeacherAccount,
  options: AdminActionOptions
): TeacherAdminActionResult {
  return {
    teacher: {
      ...teacher,
      status: "approved",
      approvedAt: options.now,
      approvedBy: options.adminId
    },
    event: createAdminActionLogEvent({
      id: options.logId,
      action: "teacher_approved",
      adminId: options.adminId,
      targetTeacherId: teacher.id,
      createdAt: options.now
    })
  };
}

export function rejectTeacher(
  teacher: IdentityTeacherAccount,
  options: RejectTeacherOptions
): TeacherAdminActionResult {
  const reason = options.reason.trim();

  return {
    teacher: {
      ...teacher,
      status: "rejected",
      rejectedAt: options.now,
      rejectedBy: options.adminId,
      rejectionReason: reason
    },
    event: createAdminActionLogEvent({
      id: options.logId,
      action: "teacher_rejected",
      adminId: options.adminId,
      targetTeacherId: teacher.id,
      createdAt: options.now,
      reason: "rejection_reason_recorded_on_teacher"
    })
  };
}

export function disableTeacher(
  teacher: IdentityTeacherAccount,
  options: AdminActionOptions
): TeacherAdminActionResult {
  return {
    teacher: {
      ...teacher,
      status: "disabled",
      disabledAt: options.now,
      disabledBy: options.adminId
    },
    event: createAdminActionLogEvent({
      id: options.logId,
      action: "teacher_disabled",
      adminId: options.adminId,
      targetTeacherId: teacher.id,
      createdAt: options.now
    })
  };
}

export function promoteTeacherToAdmin(
  teacher: IdentityTeacherAccount,
  options: AdminActionOptions
): TeacherAdminActionResult {
  return {
    teacher: {
      ...teacher,
      status: "admin",
      promotedAt: options.now,
      promotedBy: options.adminId
    },
    event: createAdminActionLogEvent({
      id: options.logId,
      action: "teacher_promoted_to_admin",
      adminId: options.adminId,
      targetTeacherId: teacher.id,
      createdAt: options.now
    })
  };
}

export function createPasswordResetAction(input: {
  teacherId: string;
  email: string;
  adminId: string;
  now: string;
  actionId: string;
  logId: string;
}): PasswordResetActionResult {
  return {
    action: {
      id: input.actionId,
      type: "send_password_reset_email",
      teacherId: input.teacherId,
      email: normalizeEmail(input.email),
      adminId: input.adminId,
      createdAt: input.now
    },
    event: createAdminActionLogEvent({
      id: input.logId,
      action: "password_reset_requested",
      adminId: input.adminId,
      targetTeacherId: input.teacherId,
      createdAt: input.now
    })
  };
}

export function canUseTeacherFeatures(teacher: Pick<IdentityTeacherAccount, "status">): boolean {
  return teacher.status === "approved" || teacher.status === "admin";
}

function createAdminActionLogEvent(input: {
  id: string;
  action: AdminAction;
  adminId: string;
  targetTeacherId: string;
  createdAt: string;
  reason?: string;
}): AdminActionLogEvent {
  const event: AdminActionLogEvent = {
    id: input.id,
    type: "admin_action_logged",
    action: input.action,
    adminId: input.adminId,
    targetTeacherId: input.targetTeacherId,
    createdAt: input.createdAt
  };

  if (input.reason !== undefined) {
    event.reason = input.reason;
  }

  return event;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
