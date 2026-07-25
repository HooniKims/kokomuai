/**
 * Translates what a failed API call actually throws into something a teacher can
 * read. The API answers with bare internal codes (`{ error: "teacher_not_found" }`),
 * which `apiClient` rethrows verbatim as `Error.message`, and the browser throws
 * English network errors of its own.
 *
 * Every place in App.tsx that puts a caught error on screen routes through here,
 * including toFriendlyFirebaseAuthError and toFriendlySignupRequestError. If you
 * add another catch block that shows a message, use this instead of
 * `caught.message` — that is how internal codes leaked to teachers before.
 */

const INTERNAL_CODE_MESSAGES: Record<string, string> = {
  // Authorization
  auth_required: "로그인이 필요합니다. 다시 로그인한 뒤 시도해 주세요.",
  invalid_token:
    "로그인 정보를 확인하지 못했습니다. 새로고침 후 다시 로그인해 주세요.",
  teacher_profile_not_found:
    "교사 정보를 찾지 못했습니다. 가입 요청을 먼저 보내 주세요.",
  teacher_not_approved: "관리자 승인을 기다리는 계정입니다.",
  admin_not_allowed: "이 계정에는 관리자 권한이 없습니다.",
  teacher_preview_requires_auth: "미리보기는 로그인한 뒤 사용할 수 있습니다.",

  // Missing or forbidden records — the server answered fine, so these must not
  // be reported as a connection problem.
  teacher_not_found: "교사 정보를 찾지 못했습니다.",
  chatbot_not_found: "챗봇을 찾지 못했습니다. 목록을 새로고침해 주세요.",
  chatbot_forbidden: "이 챗봇에 접근할 권한이 없습니다.",
  share_not_found: "공유 링크를 찾지 못했습니다. 링크가 만료됐을 수 있습니다.",
  share_token_required: "공유 링크가 올바르지 않습니다.",
  chatbot_share_mismatch: "공유 링크와 챗봇이 맞지 않습니다.",
  not_found: "요청한 정보를 찾지 못했습니다.",
};

const NETWORK_FAILURE_MESSAGE =
  "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/** What the browser throws when the API is unreachable, across engines. */
const NETWORK_FAILURE_PATTERN =
  /failed to fetch|networkerror|load failed|network request failed|err_connection/i;

export function toUserFacingErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  const message = error.message.trim();
  if (!message) return fallback;

  // hasOwn, not a bare index: a message of "constructor" would otherwise hand
  // back an inherited function that TypeScript believes is a string.
  if (Object.hasOwn(INTERNAL_CODE_MESSAGES, message)) {
    return INTERNAL_CODE_MESSAGES[message];
  }

  if (NETWORK_FAILURE_PATTERN.test(message)) return NETWORK_FAILURE_MESSAGE;

  // Messages the server wrote for the user are already Korean; anything else is
  // an internal string that would only confuse a teacher.
  return containsHangul(message) ? message : fallback;
}

export function toWorkspaceConnectionErrorMessage(error: unknown): string {
  return toUserFacingErrorMessage(error, "로컬 서버와 연결하지 못했습니다.");
}

function containsHangul(value: string): boolean {
  return /[가-힣]/.test(value);
}
