import { describe, expect, it } from "vitest";
import {
  buildSignupNoticeEmailRequest,
  createSignupNoticeEmailSender,
  sendSignupNoticeEmail
} from "../../server/signupNoticeEmail";

describe("signup notice email sender", () => {
  it("builds the Resend request with the operator recipient and teacher details", () => {
    const request = buildSignupNoticeEmailRequest({
      apiKey: "resend-key",
      to: "operator@example.com",
      teacher: {
        realName: "김하늘",
        email: "teacher@example.com",
        schoolName: "한빛초등학교"
      }
    });

    expect(request.url).toBe("https://api.resend.com/emails");
    expect(request.init.method).toBe("POST");
    expect(new Headers(request.init.headers).get("Authorization")).toBe("Bearer resend-key");

    const body = JSON.parse(request.init.body as string) as {
      from: string;
      to: string[];
      subject: string;
      text: string;
    };
    expect(body.from).toBe("꼬꼬무AI <onboarding@resend.dev>");
    expect(body.to).toEqual(["operator@example.com"]);
    expect(body.subject).toBe("[꼬꼬무AI] 교사 가입 승인 요청 — 김하늘 (teacher@example.com)");
    expect(body.text).toContain("김하늘");
    expect(body.text).toContain("teacher@example.com");
    expect(body.text).toContain("한빛초등학교");
    expect(body.text).toContain("https://kokomuai.vercel.app/admin");
  });

  it("strips line breaks and truncates oversized fields so headers cannot be injected", () => {
    const request = buildSignupNoticeEmailRequest({
      apiKey: "resend-key",
      to: "operator@example.com",
      teacher: {
        realName: "김\r\n하늘".padEnd(500, "가"),
        email: "teacher@example.com\r\nBcc: spam@example.com",
        schoolName: "한빛\n초등학교"
      }
    });

    const body = JSON.parse(request.init.body as string) as { subject: string; text: string };
    expect(body.subject).not.toMatch(/[\r\n]/);
    expect(body.subject.length).toBeLessThan(400);
    expect(body.text).toContain("한빛 초등학교");
  });

  it("sends through fetch and fails clearly when Resend rejects the request", async () => {
    const calls: string[] = [];
    await sendSignupNoticeEmail(
      {
        apiKey: "resend-key",
        to: "operator@example.com",
        teacher: { realName: "김하늘", email: "teacher@example.com", schoolName: "한빛초등학교" }
      },
      {
        fetchImpl: async (url) => {
          calls.push(String(url));
          return new Response(JSON.stringify({ id: "email-id" }), { status: 200 });
        }
      }
    );
    expect(calls).toEqual(["https://api.resend.com/emails"]);

    await expect(
      sendSignupNoticeEmail(
        {
          apiKey: "resend-key",
          to: "operator@example.com",
          teacher: { realName: "김하늘", email: "teacher@example.com", schoolName: "한빛초등학교" }
        },
        {
          fetchImpl: async () =>
            new Response(JSON.stringify({ message: "invalid api key" }), { status: 401 })
        }
      )
    ).rejects.toThrow(/401|invalid api key/);
  });

  it("creates a sender only when RESEND_API_KEY is configured", () => {
    expect(createSignupNoticeEmailSender({}, undefined)).toBeUndefined();
    expect(createSignupNoticeEmailSender({ RESEND_API_KEY: "  " }, undefined)).toBeUndefined();

    const calls: Array<{ url: string; body: string }> = [];
    const sender = createSignupNoticeEmailSender(
      { RESEND_API_KEY: "resend-key", KKOKKOMU_SIGNUP_NOTICE_EMAIL: "custom@example.com" },
      async (url, init) => {
        calls.push({ url: String(url), body: String(init?.body ?? "") });
        return new Response("{}", { status: 200 });
      }
    );
    expect(sender).toBeDefined();
  });

  it("defaults the recipient to the operator address when the env override is missing", async () => {
    const bodies: string[] = [];
    const sender = createSignupNoticeEmailSender({ RESEND_API_KEY: "resend-key" }, async (_url, init) => {
      bodies.push(String(init?.body ?? ""));
      return new Response("{}", { status: 200 });
    });

    await sender?.({ realName: "김하늘", email: "teacher@example.com", schoolName: "한빛초등학교" });

    expect(bodies).toHaveLength(1);
    expect((JSON.parse(bodies[0]) as { to: string[] }).to).toEqual(["greenguyhh@gmail.com"]);
  });
});
