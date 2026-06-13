import { describe, expect, it } from "vitest";
import {
  createDefaultAiSettings,
  updateAiSettingsModel
} from "../../src/domain/ai/aiSettings";

describe("ai settings", () => {
  it("defaults traffic to the local Gemma 4 12B model", () => {
    expect(createDefaultAiSettings("2026-06-13T00:00:00.000Z")).toMatchObject({
      activeModelId: "lmstudio:gemma-4-12b-it",
      updatedAt: "2026-06-13T00:00:00.000Z",
      updatedBy: "system"
    });
  });

  it("allows an admin to switch between OpenAI and LM Studio models", () => {
    const settings = createDefaultAiSettings("2026-06-13T00:00:00.000Z");
    const next = updateAiSettingsModel(settings, {
      modelId: "lmstudio:gemma-4-12b-it",
      adminId: "admin-1",
      now: "2026-06-13T01:00:00.000Z"
    });

    expect(next).toMatchObject({
      activeModelId: "lmstudio:gemma-4-12b-it",
      updatedAt: "2026-06-13T01:00:00.000Z",
      updatedBy: "admin-1"
    });
  });

  it("rejects unknown models before they can be saved", () => {
    const settings = createDefaultAiSettings("2026-06-13T00:00:00.000Z");

    expect(() =>
      updateAiSettingsModel(settings, {
        modelId: "unknown:model",
        adminId: "admin-1",
        now: "2026-06-13T01:00:00.000Z"
      })
    ).toThrow("Unknown AI model");
  });
});
