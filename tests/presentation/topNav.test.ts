import { describe, expect, it, vi } from "vitest";
import { TopNav } from "../../src/presentation/App";

describe("TopNav", () => {
  it("shows logout next to the profile icon without duplicating it inside the account menu", () => {
    const signOut = vi.fn();
    const tree = TopNav({
      showAccountMenu: true,
      isAccountPanelOpen: true,
      toggleAccountPanel: vi.fn(),
      signOut,
    });

    const text = collectText(tree).join(" ");
    const topLogout = findNodeByAction(tree, "top-nav-sign-out");
    const menuLogout = findNodeByAction(tree, "account-menu-sign-out");

    expect(text).toContain("로그아웃");
    expect(topLogout).toBeDefined();
    expect(menuLogout).toBeUndefined();

    (topLogout?.props?.onClick as () => void)?.();

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("hides logout controls when no account is signed in", () => {
    const tree = TopNav({
      showAccountMenu: false,
      isAccountPanelOpen: false,
      toggleAccountPanel: vi.fn(),
      signOut: vi.fn(),
    });

    expect(findNodeByAction(tree, "top-nav-sign-out")).toBeUndefined();
    expect(findNodeByAction(tree, "account-menu-sign-out")).toBeUndefined();
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
