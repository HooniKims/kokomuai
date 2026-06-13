export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LmStudioConfig {
  baseUrl: string;
  model: string;
}

export function parseOpenAIStreamLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("data:")) return null;

  const payload = trimmed.slice("data:".length).trim();
  if (payload === "[DONE]") return "[DONE]";

  const parsed = JSON.parse(payload) as {
    choices?: Array<{ delta?: { content?: string } }>;
  };

  return parsed.choices?.[0]?.delta?.content ?? null;
}

export async function createLmStudioChatCompletion(
  config: LmStudioConfig,
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.2,
      max_tokens: 700,
      stream: false
    }),
    signal
  });

  if (!response.ok) {
    throw new Error(`LM Studio request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return payload.choices?.[0]?.message?.content ?? "";
}

