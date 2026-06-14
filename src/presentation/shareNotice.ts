export interface ShareNoticeView {
  title: string;
  detail: string;
  url: string;
  tone: "success" | "ready" | "default";
}

export function formatShareNotice(message: string): ShareNoticeView {
  const [detailPart, ...urlParts] = message.split(": ");
  const detail = normalizeSentence(detailPart.trim());
  const url = urlParts.join(": ").trim();

  if (detail.includes("챗봇 생성")) {
    return {
      title: "챗봇 생성 완료",
      detail,
      url,
      tone: "success"
    };
  }

  if (detail.includes("복사")) {
    return {
      title: "복사 완료",
      detail,
      url,
      tone: "success"
    };
  }

  if (detail.includes("준비")) {
    return {
      title: "공유 준비 완료",
      detail,
      url,
      tone: "ready"
    };
  }

  return {
    title: "알림",
    detail,
    url,
    tone: "default"
  };
}

export function shouldShowShareNotice(createdAt: number, now: number, durationMs: number): boolean {
  return now - createdAt < durationMs;
}

function normalizeSentence(sentence: string): string {
  if (!sentence || /[.!?。]$/.test(sentence)) return sentence;
  return `${sentence}.`;
}
