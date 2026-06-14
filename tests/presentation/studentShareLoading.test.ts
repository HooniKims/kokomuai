import { describe, expect, it } from "vitest";
import { shouldShowStudentShareLoading } from "../../src/presentation/App";

describe("student share loading", () => {
  it("waits for the shared chatbot before rendering the student chat", () => {
    expect(shouldShowStudentShareLoading("student", true, false)).toBe(true);
    expect(shouldShowStudentShareLoading("student", true, true)).toBe(false);
  });

  it("does not block non-share student previews", () => {
    expect(shouldShowStudentShareLoading("student", false, false)).toBe(false);
    expect(shouldShowStudentShareLoading("teacher", true, false)).toBe(false);
  });
});
