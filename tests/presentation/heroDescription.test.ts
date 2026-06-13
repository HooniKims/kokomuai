import { describe, expect, it } from "vitest";
import { getHeroDescription } from "../../src/presentation/heroDescription";

describe("heroDescription", () => {
  it("uses the requested shared hero description", () => {
    expect(getHeroDescription("student")).toBe("질문과 대화를 통해 스스로 알아가는, 여러분을 위한 공간입니다.");
    expect(getHeroDescription("teacher")).toBe("질문과 대화를 통해 스스로 알아가는, 여러분을 위한 공간입니다.");
    expect(getHeroDescription("admin")).toBe("질문과 대화를 통해 스스로 알아가는, 여러분을 위한 공간입니다.");
  });
});
