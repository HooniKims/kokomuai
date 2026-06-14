import { describe, expect, it } from "vitest";
import {
  buildChatTranscriptHtml,
  makeChatTranscriptText,
} from "../../src/presentation/chatExport";

const chatbot = {
  name: "일차함수",
  schoolLevel: "middle" as const,
  gradeBand: "1",
  subject: "수학",
  topic: "일차함수의 이해",
  learningGoal: "일차함수의 식을 이해한다.",
  hintStrength: "medium" as const,
  persona: "질문으로 돕는 수학 선생님",
};

describe("chatExport", () => {
  it("keeps Korean text in the plain transcript", () => {
    const text = makeChatTranscriptText(
      [
        { role: "user", content: "x에 2를 넣으면요?" },
        { role: "assistant", content: "좋아요. y는 5가 됩니다." },
      ],
      chatbot,
    );

    expect(text).toContain("일차함수 채팅");
    expect(text).toContain("학생: x에 2를 넣으면요?");
    expect(text).toContain("챗봇: 좋아요. y는 5가 됩니다.");
  });

  it("builds escaped printable html for Korean PDF rendering", () => {
    const html = buildChatTranscriptHtml(
      [{ role: "assistant", content: "좋아요<script>alert(1)</script>" }],
      chatbot,
    );

    expect(html).toContain("일차함수 채팅");
    expect(html).toContain("좋아요&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
