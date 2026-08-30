const RESEND_ENDPOINT = "https://api.resend.com/emails";
/** Resend's shared sender. Delivers without a verified domain when the recipient owns the Resend account. */
const FROM = "꼬꼬무AI <onboarding@resend.dev>";
const DEFAULT_NOTICE_EMAIL = "greenguyhh@gmail.com";
const ADMIN_URL = "https://kokomuai.vercel.app/admin";
const TIMEOUT_MS = 8000;
const MAX_FIELD = 120;

export interface SignupNoticeTeacher {
  realName: string;
  email: string;
  schoolName: string;
}

export interface SignupNoticeEmailInput {
  apiKey: string;
  to: string;
  teacher: SignupNoticeTeacher;
}

export interface SignupNoticeEmailRequest {
  url: string;
  init: RequestInit;
}

/** Keeps a pasted essay out of the subject line and a header injection out of the mail. */
const clean = (value: string): string => value.replace(/[\r\n]+/g, " ").trim().slice(0, MAX_FIELD);

export function buildSignupNoticeEmailRequest(input: SignupNoticeEmailInput): SignupNoticeEmailRequest {
  const realName = clean(input.teacher.realName);
  const email = clean(input.teacher.email);
  const schoolName = clean(input.teacher.schoolName);
  const who = realName === "" ? email : `${realName} (${email})`;

  return {
    url: RESEND_ENDPOINT,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        from: FROM,
        to: [input.to],
        subject: `[꼬꼬무AI] 교사 가입 승인 요청 — ${who}`,
        text: [
          `${who} 님이 교사 계정을 만들었습니다.`,
          `학교: ${schoolName === "" ? "미입력" : schoolName}`,
          "",
          "승인하기 전까지 챗봇을 만들 수 없습니다.",
          `관리자 화면에서 승인해 주세요: ${ADMIN_URL}`
        ].join("\n")
      })
    }
  };
}

export async function sendSignupNoticeEmail(
  input: SignupNoticeEmailInput,
  dependencies: { fetchImpl?: typeof fetch } = {}
): Promise<void> {
  const request = buildSignupNoticeEmailRequest(input);
  const response = await (dependencies.fetchImpl ?? fetch)(request.url, request.init);

  if (!response.ok) {
    const message = await readResendErrorMessage(response);
    throw new Error(`Signup notice email request failed: ${message}`);
  }
}

/**
 * Wires the sender from the environment, or returns undefined when the deployment has
 * no mail key — signup keeps working, the operator just finds new teachers in the console.
 */
export function createSignupNoticeEmailSender(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch | undefined
): ((teacher: SignupNoticeTeacher) => Promise<void>) | undefined {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return undefined;

  const to = env.KKOKKOMU_SIGNUP_NOTICE_EMAIL?.trim() || DEFAULT_NOTICE_EMAIL;
  return (teacher) => sendSignupNoticeEmail({ apiKey, to, teacher }, { fetchImpl });
}

async function readResendErrorMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  return payload?.message ? `${response.status} ${payload.message}` : `${response.status}`;
}
