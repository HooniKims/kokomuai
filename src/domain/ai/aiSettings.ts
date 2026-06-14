import { getDefaultAiModel, listAvailableAiModels } from "./modelCatalog.js";

export interface AiSettings {
  activeModelId: string;
  updatedAt: string;
  updatedBy: string;
}

export function createDefaultAiSettings(now: string): AiSettings {
  return {
    activeModelId: getDefaultAiModel().id,
    updatedAt: now,
    updatedBy: "system"
  };
}

export function normalizeAiSettings(settings: AiSettings): AiSettings {
  if (
    settings.updatedBy === "system" &&
    settings.activeModelId === "lmstudio:gemma-4-12b-it"
  ) {
    return {
      ...settings,
      activeModelId: getDefaultAiModel().id
    };
  }

  return settings;
}

export function updateAiSettingsModel(
  current: AiSettings,
  input: {
    modelId: string;
    adminId: string;
    now: string;
  }
): AiSettings {
  if (!listAvailableAiModels().some((model) => model.id === input.modelId)) {
    throw new Error("Unknown AI model");
  }

  return {
    ...current,
    activeModelId: input.modelId,
    updatedAt: input.now,
    updatedBy: input.adminId
  };
}
