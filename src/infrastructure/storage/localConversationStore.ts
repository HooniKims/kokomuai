import type { UiChatMessage } from "../ai/streamingChatClient.js";

const keyPrefix = "curriculum-chatbot:student-conversation";

export function createConversationStorageKey(scope: string): string {
  return `${keyPrefix}:${encodeURIComponent(scope.trim() || "default")}`;
}

export function loadLocalConversation(scope = "default"): UiChatMessage[] {
  const raw = localStorage.getItem(createConversationStorageKey(scope));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as UiChatMessage[];
  } catch {
    return [];
  }
}

export function saveLocalConversation(messages: UiChatMessage[], scope = "default") {
  localStorage.setItem(createConversationStorageKey(scope), JSON.stringify(messages));
}

export function clearLocalConversation(scope = "default") {
  localStorage.removeItem(createConversationStorageKey(scope));
}
