import { describe, expect, it } from "vitest";
import { createAiProviderRequest } from "../../server/aiProviderRequest";
import { resolveAiModel } from "../../src/domain/ai/modelCatalog";

const messages = [{ role: "user" as const, content: "안녕" }];

describe("createAiProviderRequest", () => {
  it("builds an OpenAI streaming chat completion request for GPT-5.4 nano", () => {
    const request = createAiProviderRequest(resolveAiModel("openai:gpt-5.4-nano"), messages, {
      OPENAI_API_KEY: "openai-key"
    });

    expect(request.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(request.headers).toMatchObject({
      "Content-Type": "application/json; charset=utf-8",
      Authorization: "Bearer openai-key"
    });
    expect(JSON.parse(request.body)).toMatchObject({
      model: "gpt-5.4-nano",
      messages,
      stream: true,
      stream_options: {
        include_usage: true
      },
      reasoning_effort: "none"
    });
  });

  it("builds an LM Studio request with X-API-Key and documented model ids", () => {
    const request = createAiProviderRequest(resolveAiModel("lmstudio:gemma-4-12b-it"), messages, {
      LMSTUDIO_API_URL: "https://lm.alluser.site",
      LMSTUDIO_API_KEY: "local-key",
      LMSTUDIO_GEMMA_12B_MODEL: "gemma-4-12b-it"
    });

    expect(request.url).toBe("https://lm.alluser.site/v1/chat/completions");
    expect(request.headers).toMatchObject({
      "Content-Type": "application/json; charset=utf-8",
      Origin: "https://lm.alluser.site",
      Referer: "https://lm.alluser.site/",
      "X-API-Key": "local-key"
    });
    expect(JSON.parse(request.body)).toMatchObject({
      model: "gemma-4-12b-it",
      messages,
      stream: true,
      reasoning_effort: "none"
    });
  });

  it("requires provider API keys before server calls are made", () => {
    expect(() => createAiProviderRequest(resolveAiModel("openai:gpt-5.4-nano"), messages, {})).toThrow("OPENAI_API_KEY is required");
    expect(() => createAiProviderRequest(resolveAiModel("lmstudio:gemma-4-12b-it"), messages, {})).toThrow("LMSTUDIO_API_KEY is required");
  });
});
