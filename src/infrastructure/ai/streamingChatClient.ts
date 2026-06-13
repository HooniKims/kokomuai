import { parseOpenAIStreamLine } from "./lmStudioClient.js";
import type { ChatbotPolicyInput } from "../../domain/chatbot/types.js";

export interface UiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function streamStudentChat(
  input: {
    message: string;
    history: UiChatMessage[];
    chatbot: ChatbotPolicyInput;
  },
  onToken: (token: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      ...input,
      shareToken: getShareToken(input.chatbot)
    }),
    signal
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "응답을 불러오지 못했어요. 다시 시도해 주세요.");
  }

  if (!response.body) {
    throw new Error("응답을 불러오지 못했어요. 다시 시도해 주세요.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const token = parseOpenAIStreamLine(line);
      if (!token || token === "[DONE]") continue;
      onToken(token);
    }
  }
}

function getShareToken(chatbot: ChatbotPolicyInput): string | undefined {
  const share = (chatbot as { share?: { enabled?: boolean; publicToken?: string } }).share;
  return share?.enabled ? share.publicToken : undefined;
}
