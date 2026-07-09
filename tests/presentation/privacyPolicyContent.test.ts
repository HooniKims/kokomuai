import { describe, expect, it } from "vitest";
import {
  footerCopyrightText,
  privacyPolicySections,
  termsOfServiceSections
} from "../../src/presentation/legal/privacyPolicy";

describe("privacy policy content", () => {
  it("explains that student conversations stay local by default", () => {
    const text = privacyPolicySections
      .flatMap((section) => [section.title, ...section.paragraphs])
      .join("\n");

    expect(text).toContain("학생은 회원가입 없이");
    expect(text).toContain("서비스는 학생 회원가입 기능을 제공하지 않으며");
    expect(text).toContain("교사 개인이 개발·운영하는 교육용 웹앱");
    expect(text).toContain(
      "학생 대화 내용은 기본적으로 서버에 장기 보관하지 않습니다"
    );
    expect(text).toContain("이름, 학번, 연락처, 주소, 이메일");
    expect(text).toContain(
      "학생 계정 아이디, 비밀번호, 이름, 학년, 반, 번호, 이메일, 전화번호, 주소는 수집하지 않습니다."
    );
  });

  it("covers the standard privacy policy sections used for Korean services", () => {
    const titles = privacyPolicySections.map((section) => section.title);

    expect(titles).toEqual(
      expect.arrayContaining([
        "제1조 (개인정보의 처리 목적)",
        "제2조 (개인정보의 처리 및 보유기간)",
        "제3조 (처리하는 개인정보 항목)",
        "제5조 (만 14세 미만 아동의 개인정보 처리에 관한 사항)",
        "제6조 (개인정보의 제3자 제공)",
        "제7조 (개인정보 처리업무의 위탁 및 국외 이전)",
        "제8조 (개인정보의 파기 절차 및 방법)",
        "제9조 (정보주체와 법정대리인의 권리·의무 및 행사방법)",
        "제10조 (개인정보의 안전성 확보조치)",
        "제12조 (개인정보 보호책임자 및 문의)",
        "제13조 (개인정보처리방침의 변경)"
      ])
    );
  });

  it("covers edtech approval privacy checkpoints", () => {
    const text = privacyPolicySections
      .flatMap((section) => [section.title, ...section.paragraphs])
      .join("\n");

    expect(text).toContain("필요한 최소한의 개인정보");
    expect(text).toContain("법정대리인");
    expect(text).toContain("만 14세 미만 학생에게 별도 계정 생성을 요구하지 않습니다");
    expect(text).toContain("만 14세 미만 학생의 이름, 학번, 연락처, 주소, 이메일 등 학생 회원정보를 수집하지 않습니다");
    expect(text).not.toContain("보호자 동의 절차");
    expect(text).toContain("접근권한 관리");
    expect(text).toContain("관리자 계정 관리");
    expect(text).toContain("위탁 또는 외부 처리 가능성이 있는 업무");
    expect(text).toContain("AI 응답 생성");
  });

  it("lists the privacy manager and inquiry phone number", () => {
    const text = privacyPolicySections
      .flatMap((section) => [section.title, ...section.paragraphs])
      .join("\n");

    expect(text).toContain("제12조 (개인정보 보호책임자 및 문의)");
    expect(text).toContain("개인정보 보호책임자: 김형훈 교사(등촌중학교)");
    expect(text).toContain("문의: 02-6380-8339");
  });

  it("uses the privacy manager wording in the footer", () => {
    expect(footerCopyrightText).toBe(
      "개인정보책임자 : 김형훈 교사(등촌중학교) 문의 02-6380-8339"
    );
  });

  it("provides terms of service tailored to teacher accounts and student share links", () => {
    const text = termsOfServiceSections
      .flatMap((section) => [section.title, ...section.paragraphs])
      .join("\n");

    expect(text).toContain("이용약관");
    expect(text).toContain("제2조 (정의)");
    expect(text).toContain("제3조 (약관의 명시와 개정)");
    expect(text).toContain(
      "서비스의 계정 가입 대상은 교사와 관리자입니다. 학생은 별도 회원가입 없이"
    );
    expect(text).toContain(
      "학생에게는 아이디, 비밀번호, 이름, 학년, 반, 번호, 이메일, 전화번호"
    );
    expect(text).toContain("부칙");
    expect(text).toContain("2026년 7월 9일부터 시행됩니다");
  });
});
