import { describe, expect, it } from "vitest";
import { parseOpenAIStreamLine } from "../../src/infrastructure/ai/lmStudioClient";

describe("parseOpenAIStreamLine", () => {
  it("extracts streamed delta content from an OpenAI-compatible SSE line", () => {
    const parsed = parseOpenAIStreamLine(
      'data: {"choices":[{"delta":{"content":"안녕"}}]}'
    );

    expect(parsed).toBe("안녕");
  });

  it("returns done for the final SSE marker", () => {
    expect(parseOpenAIStreamLine("data: [DONE]")).toBe("[DONE]");
  });

  it("ignores empty lines", () => {
    expect(parseOpenAIStreamLine("")).toBeNull();
  });
});
