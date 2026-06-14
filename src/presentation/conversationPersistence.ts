export function shouldPersistConversation(input: {
  hasLoadedConversation: boolean;
  loadedScope: string;
  currentScope: string;
}): boolean {
  return input.hasLoadedConversation && input.loadedScope === input.currentScope;
}
