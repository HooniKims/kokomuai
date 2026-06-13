import { getDefaultAiModel, listAvailableAiModels } from "./modelCatalog";

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
