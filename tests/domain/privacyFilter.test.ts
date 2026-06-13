import { describe, expect, it } from "vitest";
import { detectPrivacyRisks } from "../../src/domain/privacy/privacyFilter";

describe("detectPrivacyRisks", () => {
  it("blocks phone numbers, email addresses, addresses, and student-number-like values", () => {
    const result = detectPrivacyRisks(
      "제 번호는 010-1234-5678이고 test@example.com 입니다. 서울시 강남구 어딘가에 살고 학번은 20241234예요."
    );

    expect(result.blocked).toBe(true);
    expect(result.risks.map((risk) => risk.type)).toEqual(
      expect.arrayContaining(["phone", "email", "address", "studentNumber"])
    );
  });

  it("does not block ordinary learning text with numbers and formulas", () => {
    const result = detectPrivacyRisks("2x + 3 = 7에서 양쪽에 3을 빼면 어떻게 되나요?");

    expect(result.blocked).toBe(false);
    expect(result.risks).toEqual([]);
  });
});
