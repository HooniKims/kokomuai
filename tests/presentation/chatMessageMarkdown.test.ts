import { describe, expect, it } from "vitest";
import { renderChatMessageMarkdown } from "../../src/presentation/chatMessageMarkdown";

describe("chatMessageMarkdown", () => {
  it("renders bold and underline markers instead of showing raw symbols", () => {
    expect(renderChatMessageMarkdown("**<u>관형사</u>**는 체언을 꾸며요.")).toBe("<strong><u>관형사</u></strong>는 체언을 꾸며요.");
  });

  it("escapes unsafe html while preserving supported formatting", () => {
    expect(renderChatMessageMarkdown("<script>alert(1)</script> **중요**")).toBe("&lt;script&gt;alert(1)&lt;/script&gt; <strong>중요</strong>");
  });

  it("keeps line breaks readable", () => {
    expect(renderChatMessageMarkdown("첫 줄\n둘째 줄")).toBe("첫 줄<br />둘째 줄");
  });
});
