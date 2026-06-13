import { describe, expect, it } from "vitest";
import { footerCopyrightText, privacyPolicySections } from "../../src/presentation/legal/privacyPolicy";

describe("privacy policy content", () => {
  it("explains that student conversations stay local by default", () => {
    const text = privacyPolicySections.flatMap((section) => [section.title, ...section.paragraphs]).join("\n");

    expect(text).toContain("학생은 회원가입 없이");
    expect(text).toContain("학생 대화 내용은 기본적으로 서버에 장기 보관하지 않습니다");
    expect(text).toContain("이름, 학번, 연락처, 주소");
  });

  it("covers the standard privacy policy sections used for Korean services", () => {
    const titles = privacyPolicySections.map((section) => section.title);

    expect(titles).toEqual(
      expect.arrayContaining([
        "개인정보의 처리 목적",
        "처리하는 개인정보의 항목",
        "개인정보의 처리 및 보유기간",
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

  it("uses the standard copyright wording", () => {
    expect(footerCopyrightText).toBe("© HoomiKim. All Rights Reserved.");
  });
});
