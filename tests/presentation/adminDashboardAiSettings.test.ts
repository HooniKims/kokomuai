import { describe, expect, it, vi } from "vitest";
import { AdminDashboardRoute } from "../../src/presentation/routes/AdminDashboardRoute";

describe("AdminDashboardRoute AI settings", () => {
  it("renders the active model selector for admins", () => {
    const tree = AdminDashboardRoute({
      teachers: [],
      selectedTeacherIds: [],
      setSelectedTeacherIds: vi.fn(),
      approveSelectedTeachers: vi.fn(),
      createResetMailAction: vi.fn(),
      resetLog: "",
      aiSettings: {
        settings: {
          activeModelId: "openai:gpt-5.4-nano",
          updatedAt: "2026-06-13T00:00:00.000Z",
          updatedBy: "system"
        },
        models: [
          {
            id: "openai:gpt-5.4-nano",
            provider: "openai",
            apiModel: "gpt-5.4-nano",
            displayName: "GPT-5.4 nano",
            description: "운영 기본값",
            isDefault: true,
            pricing: {
              inputUsdPerMillionTokens: 0.2,
              outputUsdPerMillionTokens: 1.25
            }
          },
          {
            id: "lmstudio:gemma-4-12b-it",
            provider: "lmstudio",
            apiModel: "gemma-4-12b-it",
            displayName: "Gemma 4 12B",
            description: "로컬 LLM",
            isDefault: false,
            pricing: {
              inputUsdPerMillionTokens: 0,
              outputUsdPerMillionTokens: 0
            }
          }
        ]
      },
      updateAiModel: vi.fn()
    });

    const text = collectText(tree).join(" ");

    expect(text).toContain("AI 모델");
    expect(text).toContain("GPT-5.4 nano");
    expect(text).toContain("Gemma 4 12B");
  });

  it("keeps model selection local until the admin confirms it", () => {
    const updateAiModel = vi.fn();
    const setSelectedAiModelId = vi.fn();
    const tree = AdminDashboardRoute({
      teachers: [],
      selectedTeacherIds: [],
      setSelectedTeacherIds: vi.fn(),
      approveSelectedTeachers: vi.fn(),
      createResetMailAction: vi.fn(),
      resetLog: "",
      aiSettings: {
        settings: {
          activeModelId: "gemma4:e2b",
          updatedAt: "2026-06-13T00:00:00.000Z",
          updatedBy: "system"
        },
        models: [
          {
            id: "gemma4:e2b",
            provider: "lmstudio",
            apiModel: "google/gemma-4-e2b",
            displayName: "Gemma 4 E2B",
            description: "가벼운 기본 모델",
            isDefault: true,
            pricing: {
              inputUsdPerMillionTokens: 0,
              outputUsdPerMillionTokens: 0
            }
          },
          {
            id: "lmstudio:gemma-4-12b-it",
            provider: "lmstudio",
            apiModel: "gemma-4-12b-it",
            displayName: "Gemma 4 12B",
            description: "높은 품질 모델",
            isDefault: false,
            pricing: {
              inputUsdPerMillionTokens: 0,
              outputUsdPerMillionTokens: 0
            }
          }
        ]
      },
      selectedAiModelId: "lmstudio:gemma-4-12b-it",
      setSelectedAiModelId,
      updateAiModel
    });

    const select = findByType(tree, "select");
    select?.props?.onChange?.({ target: { value: "gemma4:e2b" } });
    expect(setSelectedAiModelId).toHaveBeenCalledWith("gemma4:e2b");
    expect(updateAiModel).not.toHaveBeenCalled();

    const applyButton = findButtonByText(tree, "적용");
    applyButton?.props?.onClick?.();
    expect(updateAiModel).toHaveBeenCalledWith("lmstudio:gemma-4-12b-it");
  });
});

function collectText(node: unknown): string[] {
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectText);

  const props = "props" in node ? (node as { props?: { children?: unknown } }).props : undefined;
  return collectText(props?.children);
}

function findByType(node: unknown, type: string): { props?: Record<string, any> } | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByType(child, type);
      if (found) return found;
    }
    return null;
  }

  const candidate = node as { type?: unknown; props?: { children?: unknown } };
  if (candidate.type === type) return candidate as { props?: Record<string, any> };
  return findByType(candidate.props?.children, type);
}

function findButtonByText(node: unknown, text: string): { props?: Record<string, any> } | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findButtonByText(child, text);
      if (found) return found;
    }
    return null;
  }

  const candidate = node as { type?: unknown; props?: { children?: unknown } };
  if (candidate.type === "button" && collectText(candidate).join(" ").includes(text)) {
    return candidate as { props?: Record<string, any> };
  }
  return findButtonByText(candidate.props?.children, text);
}
