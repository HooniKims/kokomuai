import type { AiModelOption } from "../src/domain/ai/modelCatalog.js";

export type ProviderMessage = { role: "system" | "user" | "assistant"; content: string };

export interface ProviderEnvironment {
  OPENAI_API_KEY?: string;
  LMSTUDIO_API_URL?: string;
  LMSTUDIO_API_KEY?: string;
  LMSTUDIO_GEMMA_E4B_MODEL?: string;
  LMSTUDIO_GEMMA_E2B_MODEL?: string;
  LMSTUDIO_GEMMA_12B_MODEL?: string;
  LMSTUDIO_GEMMA_26B_MODEL?: string;
}

export interface AiProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export function createAiProviderRequest(model: AiModelOption, messages: ProviderMessage[], env: ProviderEnvironment): AiProviderRequest {
  if (model.provider === "openai") {
    return createOpenAiRequest(model, messages, env);
  }

  return createLmStudioRequest(model, messages, env);
}

function createOpenAiRequest(model: AiModelOption, messages: ProviderMessage[], env: ProviderEnvironment): AiProviderRequest {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");

  return {
    url: "https://api.openai.com/v1/chat/completions",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model.apiModel,
      messages,
      temperature: 0.3,
      max_completion_tokens: 700,
      reasoning_effort: "none",
      stream: true,
      stream_options: {
        include_usage: true
      }
    })
  };
}

function createLmStudioRequest(model: AiModelOption, messages: ProviderMessage[], env: ProviderEnvironment): AiProviderRequest {
  const apiKey = env.LMSTUDIO_API_KEY?.trim();
  if (!apiKey) throw new Error("LMSTUDIO_API_KEY is required");

  const baseUrl = stripTrailingSlash(env.LMSTUDIO_API_URL?.trim() || "https://lm.alluser.site");
  return {
    url: `${baseUrl}/v1/chat/completions`,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Origin: baseUrl,
      Referer: `${baseUrl}/`,
      "X-API-Key": apiKey
    },
    body: JSON.stringify({
      model: resolveLmStudioApiModel(model, env),
      messages,
      temperature: 0.3,
      max_tokens: getMaxTokensForLocalModel(model.id),
      reasoning_effort: "none",
      stream: true
    })
  };
}

function resolveLmStudioApiModel(model: AiModelOption, env: ProviderEnvironment): string {
  if (model.id === "gemma4:e4b") return env.LMSTUDIO_GEMMA_E4B_MODEL || model.apiModel;
  if (model.id === "gemma4:e2b") return env.LMSTUDIO_GEMMA_E2B_MODEL || model.apiModel;
  if (model.id === "lmstudio:gemma-4-12b-it") return env.LMSTUDIO_GEMMA_12B_MODEL || model.apiModel;
  if (model.id === "lmstudio:gemma-4-26b-a4b-it-q4ks") return env.LMSTUDIO_GEMMA_26B_MODEL || model.apiModel;
  return model.apiModel;
}

function getMaxTokensForLocalModel(modelId: string): number {
  const normalized = modelId.toLowerCase();
  if (normalized.includes("12b") || normalized.includes("26b")) return 4096;
  if (normalized.includes("e4b")) return 3072;
  return 700;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
