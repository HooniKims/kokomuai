import type { ChatbotPolicyInput } from "../domain/chatbot/types.js";
import type { UiChatMessage } from "../infrastructure/ai/streamingChatClient.js";
import { formatSchoolLevelLabel } from "./schoolLevelLabel.js";

export function makeChatTranscriptText(
  messages: UiChatMessage[],
  chatbot: ChatbotPolicyInput & { name?: string },
) {
  const title = chatbot.name?.trim() || chatbot.topic;
  const lines = [
    `${title} 채팅`,
    "",
    "이 기록은 학습 과정 확인용이며, 정답지나 평가 결과가 아닙니다.",
    `수업 주제: ${chatbot.topic}`,
    `학교급/과목: ${formatSchoolLevelLabel(chatbot.schoolLevel)} ${chatbot.gradeBand} · ${chatbot.subject}`,
    `저장 날짜: ${new Date().toLocaleString("ko-KR")}`,
    "",
    "대화 기록",
    "---------",
    ...messages.map(
      (message) =>
        `${message.role === "user" ? "학생" : "챗봇"}: ${message.content}`,
    ),
  ];
  return lines.join("\n");
}

export function buildChatTranscriptHtml(
  messages: UiChatMessage[],
  chatbot: ChatbotPolicyInput & { name?: string },
) {
  const title = chatbot.name?.trim() || chatbot.topic;
  const rows = messages
    .map(
      (message) => `
        <section class="pdf-message ${message.role}">
          <strong>${message.role === "user" ? "학생" : "챗봇"}</strong>
          <p>${escapeHtml(message.content).replace(/\n/g, "<br />")}</p>
        </section>`,
    )
    .join("");

  return `
    <article class="pdf-transcript">
      <h1>${escapeHtml(title)} 채팅</h1>
      <p class="pdf-note">이 기록은 학습 과정 확인용이며, 정답지나 평가 결과가 아닙니다.</p>
      <dl>
        <div><dt>수업 주제</dt><dd>${escapeHtml(chatbot.topic)}</dd></div>
        <div><dt>학교급/과목</dt><dd>${escapeHtml(`${formatSchoolLevelLabel(chatbot.schoolLevel)} ${chatbot.gradeBand} · ${chatbot.subject}`)}</dd></div>
        <div><dt>저장 날짜</dt><dd>${escapeHtml(new Date().toLocaleString("ko-KR"))}</dd></div>
      </dl>
      <h2>대화 기록</h2>
      ${rows}
    </article>`;
}

export async function saveChatTranscriptPdfFromHtml(html: string) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const host = createPdfHost(html);
  document.body.appendChild(host);

  try {
    await document.fonts?.ready;
    const canvas = await html2canvas(host, {
      backgroundColor: "#fffdf7",
      scale: Math.min(window.devicePixelRatio || 1, 2),
      useCORS: true,
    });
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 36;
    const imageWidth = pageWidth - margin * 2;
    const pageCanvasHeight = Math.floor(
      ((pageHeight - margin * 2) * canvas.width) / imageWidth,
    );

    let sourceY = 0;
    let pageIndex = 0;
    while (sourceY < canvas.height) {
      const sliceHeight = Math.min(pageCanvasHeight, canvas.height - sourceY);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      const context = pageCanvas.getContext("2d");
      if (!context) throw new Error("PDF 캔버스를 만들지 못했습니다.");
      context.drawImage(
        canvas,
        0,
        sourceY,
        canvas.width,
        sliceHeight,
        0,
        0,
        canvas.width,
        sliceHeight,
      );
      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(
        pageCanvas.toDataURL("image/png"),
        "PNG",
        margin,
        margin,
        imageWidth,
        (sliceHeight * imageWidth) / canvas.width,
      );
      sourceY += sliceHeight;
      pageIndex += 1;
    }

    pdf.save("student-chat.pdf");
  } finally {
    host.remove();
  }
}

function createPdfHost(html: string) {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = "760px";
  host.style.padding = "32px";
  host.style.background = "#fffdf7";
  host.style.color = "#153300";
  host.style.fontFamily =
    "Paperlogy, Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif";
  host.innerHTML = `
    <style>
      .pdf-transcript { font-size: 16px; line-height: 1.7; }
      .pdf-transcript h1 { margin: 0 0 12px; font-size: 28px; }
      .pdf-transcript h2 { margin: 28px 0 12px; font-size: 20px; }
      .pdf-note { margin: 0 0 18px; color: #5b6f40; }
      .pdf-transcript dl { margin: 0 0 22px; padding: 14px 16px; border: 1px solid #d8dec8; border-radius: 8px; }
      .pdf-transcript dl div { display: flex; gap: 14px; margin: 4px 0; }
      .pdf-transcript dt { min-width: 90px; font-weight: 700; }
      .pdf-transcript dd { margin: 0; }
      .pdf-message { margin: 12px 0; padding: 14px 16px; border-radius: 8px; border: 1px solid #d8dec8; background: #f7fbef; }
      .pdf-message.user { background: #153300; color: #fffdf7; }
      .pdf-message strong { display: block; margin-bottom: 6px; }
      .pdf-message p { margin: 0; white-space: normal; word-break: keep-all; overflow-wrap: anywhere; }
    </style>
    ${html}`;
  return host;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
