import type { ManagedChatbot } from "../domain/chatbot/chatbotManagement.js";

export function toggleChatbotSelection(selectedIds: string[], chatbotId: string): string[] {
  if (selectedIds.includes(chatbotId)) {
    return selectedIds.filter((id) => id !== chatbotId);
  }

  return [...selectedIds, chatbotId];
}

export function toggleAllChatbotSelection(selectedIds: string[], chatbots: ManagedChatbot[]): string[] {
  const visibleIds = chatbots.map((chatbot) => chatbot.id);
  const everyVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  if (everyVisibleSelected) return selectedIds.filter((id) => !visibleIds.includes(id));

  return Array.from(new Set([...selectedIds, ...visibleIds]));
}

export function resolveNextChatbotSelection(selectedIds: string[], deletedIds: string[]): string[] {
  return selectedIds.filter((id) => !deletedIds.includes(id));
}
