import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PrivacyPolicyRoute } from "../../src/presentation/routes/PrivacyPolicyRoute";
import { TermsOfServiceRoute } from "../../src/presentation/routes/TermsOfServiceRoute";

const appSource = readFileSync("src/presentation/App.tsx", "utf8");

describe("legal page navigation", () => {
  it("shows a main-page link inside the privacy policy page", () => {
    const tree = PrivacyPolicyRoute();
    const backLink = findNodeByAction(tree, "back-to-main");

    expect(backLink?.props?.href).toBe("/");
    expect(collectText(backLink).join(" ")).toContain("메인으로 돌아가기");
  });

  it("shows a main-page link inside the terms page", () => {
    const tree = TermsOfServiceRoute();
    const backLink = findNodeByAction(tree, "back-to-main");

    expect(backLink?.props?.href).toBe("/");
    expect(collectText(backLink).join(" ")).toContain("메인으로 돌아가기");
  });

  it("wires both legal footer links and a terms route", () => {
    expect(appSource).toContain('window.location.pathname === "/terms"');
    expect(appSource).toContain("<TermsOfServiceRoute />");
    expect(appSource).toContain('href="/terms"');
    expect(appSource).toContain(">이용약관</a>");
    expect(appSource).toContain('href="/privacy"');
    expect(appSource).toContain(">개인정보처리방침</a>");
  });
});

function findNodeByAction(
  node: unknown,
  action: string,
): { props?: Record<string, unknown> } | undefined {
  return collectNodes(node).find(
    (candidate) => candidate.props?.["data-action"] === action,
  );
}

function collectText(node: unknown): string[] {
  if (typeof node === "string" || typeof node === "number")
    return [String(node)];
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectText);

  const props =
    "props" in node
      ? (node as { props?: { children?: unknown } }).props
      : undefined;
  return collectText(props?.children);
}

function collectNodes(
  node: unknown,
): Array<{ props?: Record<string, unknown> }> {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectNodes);

  const props =
    "props" in node
      ? ((node as { props?: { children?: unknown } }).props ?? {})
      : {};
  return [
    node as { props?: Record<string, unknown> },
    ...collectNodes(props.children),
  ];
}
