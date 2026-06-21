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
        "개인정보의 처리 목적",
        "처리하는 개인정보의 항목",
        "개인정보의 처리 및 보유기간",
        "만 14세 미만 아동의 개인정보 처리",
        "개인정보의 제3자 제공",
        "개인정보 처리업무의 위탁 및 국외 이전",
        "개인정보의 파기 절차 및 방법",
        "정보주체와 법정대리인의 권리 행사",
        "개인정보의 안전성 확보조치",
        "개인정보 보호책임자 및 문의",
        "개인정보처리방침의 변경"
      ])
    );
  });

  it("lists the privacy manager and inquiry phone number", () => {
    const text = privacyPolicySections
      .flatMap((section) => [section.title, ...section.paragraphs])
      .join("\n");

    expect(text).toContain("개인정보 보호책임자 및 문의");
    expect(text).toContain("개인정보 보호책임자: 김형훈 교사(등촌중학교)");
    expect(text).toContain("문의: 02-6380-8341");
  });

  it("uses the privacy manager wording in the footer", () => {
    expect(footerCopyrightText).toBe(
      "개인정보책임자 : 김형훈 교사(등촌중학교) 문의 02-6380-8341"
    );
  });

  it("provides terms of service tailored to teacher accounts and student share links", () => {
    const text = termsOfServiceSections
      .flatMap((section) => [section.title, ...section.paragraphs])
      .join("\n");

    expect(text).toContain("이용약관");
    expect(text).toContain(
      "서비스의 계정 가입 대상은 교사와 관리자입니다. 학생은 별도 회원가입 없이"
    );
    expect(text).toContain(
      "학생에게는 아이디, 비밀번호, 이름, 학년, 반, 번호, 이메일, 전화번호"
    );
  });
});
