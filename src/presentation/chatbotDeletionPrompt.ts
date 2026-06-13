export function getChatbotDeletionPrompt(chatbotName: string): string {
  return `${chatbotName.trim() || "이"} 챗봇과 공유 링크를 삭제할까요?`;
}
