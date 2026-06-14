export function shouldKeepAuthWaitingOverlay(input: {
  isSubmittingAuth: boolean;
  isResolvingAuthSession: boolean;
}): boolean {
  return input.isSubmittingAuth || input.isResolvingAuthSession;
}
