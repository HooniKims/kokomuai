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
});

function collectText(node: unknown): string[] {
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectText);

  const props = "props" in node ? (node as { props?: { children?: unknown } }).props : undefined;
  return collectText(props?.children);
}
