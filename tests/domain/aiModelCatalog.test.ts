import { describe, expect, it } from "vitest";
import {
  calculateModelCostUsd,
  getDefaultAiModel,
  listAvailableAiModels,
  resolveAiModel
} from "../../src/domain/ai/modelCatalog";

describe("ai model catalog", () => {
  it("uses Gemma 4 E2B as the default local LLM model", () => {
    expect(getDefaultAiModel()).toMatchObject({
      id: "gemma4:e2b",
      provider: "lmstudio",
      apiModel: "google/gemma-4-e2b",
      displayName: "Gemma 4 E2B"
    });
  });

  it("exposes OpenAI and LM Studio choices for admin switching", () => {
    const models = listAvailableAiModels();

    expect(models.map((model) => model.id)).toEqual([
      "openai:gpt-5.4-nano",
      "lmstudio:gemma-4-12b-it",
      "gemma4:e4b",
      "gemma4:e2b",
      "lmstudio:gemma-4-26b-a4b-it-q4ks"
    ]);
  });

  it("calculates OpenAI cost from input and output token counts", () => {
    const cost = calculateModelCostUsd(resolveAiModel("openai:gpt-5.4-nano"), {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000
    });

    expect(cost).toBe(1.45);
  });

  it("keeps local LLM cost at zero while still allowing token accounting", () => {
    const cost = calculateModelCostUsd(resolveAiModel("lmstudio:gemma-4-12b-it"), {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000
    });

    expect(cost).toBe(0);
  });
});
