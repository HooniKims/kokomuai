/**
 * The API returns bare internal codes (`{ error: "teacher_not_approved" }`) and
 * the browser throws English network errors ("Failed to fetch"). Neither is
 * something a teacher should read, so both are translated here before they
 * reach the screen.
 */

const INTERNAL_CODE_MESSAGES: Record<string, string> = {
  auth_required: "로그인이 필요합니다. 다시 로그인한 뒤 시도해 주세요.",
  invalid_token:
    "로그인 정보를 확인하지 못했습니다. 새로고침 후 다시 로그인해 주세요.",
  teacher_profile_not_found:
    "교사 정보를 찾지 못했습니다. 가입 요청을 먼저 보내 주세요.",
  teacher_not_approved: "관리자 승인을 기다리는 계정입니다.",
  admin_not_allowed: "이 계정에는 관리자 권한이 없습니다.",
};

const CONNECTION_FALLBACK = "로컬 서버와 연결하지 못했습니다.";

export function toWorkspaceConnectionErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return CONNECTION_FALLBACK;

  const message = error.message.trim();
  if (!message) return CONNECTION_FALLBACK;

  const translated = INTERNAL_CODE_MESSAGES[message];
  if (translated) return translated;

  // Messages the server wrote for the user are already Korean; anything else is
  // an internal string that would only confuse a teacher.
  return containsHangul(message) ? message : CONNECTION_FALLBACK;
}

function containsHangul(value: string): boolean {
  return /[가-힣]/.test(value);
}
