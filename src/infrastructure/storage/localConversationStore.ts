import type { UiChatMessage } from "../ai/streamingChatClient";

const key = "curriculum-chatbot:student-conversation";

export function loadLocalConversation(): UiChatMessage[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as UiChatMessage[];
  } catch {
    return [];
  }
}

export function saveLocalConversation(messages: UiChatMessage[]) {
  localStorage.setItem(key, JSON.stringify(messages));
}

export function clearLocalConversation() {
  localStorage.removeItem(key);
}

