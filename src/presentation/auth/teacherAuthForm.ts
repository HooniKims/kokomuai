import type { RegisterLocalTeacherInput } from "../../domain/identity/identityAccess";
import type { SchoolSearchResult } from "../apiClient";

export interface TeacherProfileDraft {
  realName: string;
  email: string;
  selectedSchool: SchoolSearchResult | null;
}

export function canSubmitTeacherProfile(draft: TeacherProfileDraft): boolean {
  return draft.realName.trim().length > 0 && normalizeEmail(draft.email).length > 0 && draft.selectedSchool !== null;
}

export function buildTeacherRegistrationPayload(draft: TeacherProfileDraft): RegisterLocalTeacherInput {
  if (!canSubmitTeacherProfile(draft) || !draft.selectedSchool) {
    throw new Error("학교 검색 결과에서 학교를 선택해야 가입할 수 있습니다.");
  }

  return {
    realName: draft.realName.trim(),
    email: normalizeEmail(draft.email),
    passwordHash: "firebase-auth",
    school: {
      schoolName: draft.selectedSchool.schoolName,
      schoolKind: draft.selectedSchool.schoolKind,
      officeCode: draft.selectedSchool.officeCode,
      standardSchoolCode: draft.selectedSchool.standardSchoolCode,
      region: draft.selectedSchool.region,
      address: draft.selectedSchool.address
    }
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
