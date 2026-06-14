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
  it("renders inline math markers without exposing dollar signs", () => {
    expect(renderChatMessageMarkdown("입력값 $x$와 결과값 $y = 2x + 3$를 봐요.")).toBe(
      '입력값 <span class="inline-math">x</span>와 결과값 <span class="inline-math">y = 2x + 3</span>를 봐요.'
    );
  });

  it("escapes html inside inline math", () => {
    expect(renderChatMessageMarkdown("값은 $<script>x</script>$입니다.")).toBe(
      '값은 <span class="inline-math">&lt;script&gt;x&lt;/script&gt;</span>입니다.'
    );
  });
  it("renders display math markers without exposing dollar signs", () => {
    expect(renderChatMessageMarkdown("formula $$y = ax + b$$ next")).toBe(
      'formula <span class="display-math">y = ax + b</span> next'
    );
  });

  it("renders latex text commands as plain math text", () => {
    expect(renderChatMessageMarkdown("when \\text{x}=2, \\text{y}=5")).toBe(
      'when <span class="inline-math">x</span>=2, <span class="inline-math">y</span>=5'
    );
  });

  it("renders parenthesized latex inline math and escaped blanks", () => {
    expect(renderChatMessageMarkdown("예: \\(y=\\_\\_\\_x+\\_\\_\\_\\)")).toBe(
      '예: <span class="inline-math">y=___x+___</span>'
    );
  });

  it("renders bracketed latex display math without exposing delimiters", () => {
    expect(renderChatMessageMarkdown("다음 식을 봐요:\n\\[\ny = ax + b\n\\]")).toBe(
      '다음 식을 봐요:<br /><span class="display-math">y = ax + b</span>'
    );
  });

  it("renders simple chemical notation commands as readable inline text", () => {
    expect(renderChatMessageMarkdown("물은 \\ce{H2O}, 반응은 \\(2H2 + O2 \\rightarrow 2H2O\\)")).toBe(
      '물은 <span class="inline-math">H2O</span>, 반응은 <span class="inline-math">2H2 + O2 → 2H2O</span>'
    );
  });
});
