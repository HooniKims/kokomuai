export type AiProvider = "openai" | "lmstudio";

export interface AiModelPricing {
  inputUsdPerMillionTokens: number;
  cachedInputUsdPerMillionTokens?: number;
  outputUsdPerMillionTokens: number;
}

export interface AiModelOption {
  id: string;
  provider: AiProvider;
  apiModel: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  pricing: AiModelPricing;
}

export interface AiTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

const availableAiModels: AiModelOption[] = [
  {
    id: "openai:gpt-5.4-nano",
    provider: "openai",
    apiModel: "gpt-5.4-nano",
    displayName: "GPT-5.4 nano",
    description: "Vercel 운영 기본값, 낮은 비용과 빠른 응답을 우선",
    isDefault: false,
    pricing: {
      inputUsdPerMillionTokens: 0.2,
      cachedInputUsdPerMillionTokens: 0.02,
      outputUsdPerMillionTokens: 1.25
    }
  },
  {
    id: "lmstudio:gemma-4-12b-it",
    provider: "lmstudio",
    apiModel: "gemma-4-12b-it",
    displayName: "Gemma 4 12B",
    description: "로컬 LLM 기본값, 속도와 품질 균형",
    isDefault: true,
    pricing: freeLocalPricing()
  },
  {
    id: "gemma4:e4b",
    provider: "lmstudio",
    apiModel: "google/gemma-4-e4b",
    displayName: "Gemma 4 E4B",
    description: "빠름, 품질 보통",
    isDefault: false,
    pricing: freeLocalPricing()
  },
  {
    id: "gemma4:e2b",
    provider: "lmstudio",
    apiModel: "google/gemma-4-e2b",
    displayName: "Gemma 4 E2B",
    description: "가장 빠름, 간단 작업용",
    isDefault: false,
    pricing: freeLocalPricing()
  },
  {
    id: "lmstudio:gemma-4-26b-a4b-it-q4ks",
    provider: "lmstudio",
    apiModel: "gemma-4-26b-a4b-it",
    displayName: "Gemma 4 26B Q4",
    description: "가장 느림, 품질 높음",
    isDefault: false,
    pricing: freeLocalPricing()
  }
];

export function listAvailableAiModels(): AiModelOption[] {
  return availableAiModels.map((model) => ({ ...model, pricing: { ...model.pricing } }));
}

export function getDefaultAiModel(): AiModelOption {
  return resolveAiModel("lmstudio:gemma-4-12b-it");
}

export function resolveAiModel(modelId: string | undefined): AiModelOption {
  const model = availableAiModels.find((candidate) => candidate.id === modelId) ?? availableAiModels.find((candidate) => candidate.isDefault);
  if (!model) {
    throw new Error("No default AI model configured");
  }

  return { ...model, pricing: { ...model.pricing } };
}

export function calculateModelCostUsd(model: Pick<AiModelOption, "pricing">, usage: AiTokenUsage): number {
  const cachedInputTokens = Math.max(0, usage.cachedInputTokens ?? 0);
  const regularInputTokens = Math.max(0, usage.inputTokens - cachedInputTokens);
  const inputCost = (regularInputTokens / 1_000_000) * model.pricing.inputUsdPerMillionTokens;
  const cachedInputCost = (cachedInputTokens / 1_000_000) * (model.pricing.cachedInputUsdPerMillionTokens ?? model.pricing.inputUsdPerMillionTokens);
  const outputCost = (Math.max(0, usage.outputTokens) / 1_000_000) * model.pricing.outputUsdPerMillionTokens;

  return roundCurrency(inputCost + cachedInputCost + outputCost);
}

function freeLocalPricing(): AiModelPricing {
  return {
    inputUsdPerMillionTokens: 0,
    cachedInputUsdPerMillionTokens: 0,
    outputUsdPerMillionTokens: 0
  };
}

function roundCurrency(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
