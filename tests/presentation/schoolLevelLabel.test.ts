import { describe, expect, it } from "vitest";
import { formatSchoolLevelLabel } from "../../src/presentation/schoolLevelLabel";

describe("formatSchoolLevelLabel", () => {
  it("formats stored school level codes in Korean", () => {
    expect(formatSchoolLevelLabel("elementary")).toBe("초등학교");
    expect(formatSchoolLevelLabel("middle")).toBe("중학교");
    expect(formatSchoolLevelLabel("high")).toBe("고등학교");
    expect(formatSchoolLevelLabel("vocational_high")).toBe("직업계고");
  });

  it("formats special class variants in Korean", () => {
    expect(formatSchoolLevelLabel("special")).toBe("특수학급");
    expect(formatSchoolLevelLabel("special_class")).toBe("특수학급");
    expect(formatSchoolLevelLabel("special-education")).toBe("특수교육");
  });

  it("keeps unknown labels readable instead of hiding them", () => {
    expect(formatSchoolLevelLabel("대안학교")).toBe("대안학교");
  });
});
