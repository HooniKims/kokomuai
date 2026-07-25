const FORBIDDEN_FILE_NAME_CHARS = /[/\\:*?"<>|\u0000-\u001f]/g;
const TRIMMED_FILE_NAME_EDGES = /^[-.]+|[-.]+$/g;
const MAX_FILE_NAME_LENGTH = 50;

export function buildShareQrFileName(name: string): string {
  const normalized = name
    .replace(FORBIDDEN_FILE_NAME_CHARS, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(TRIMMED_FILE_NAME_EDGES, "")
    .slice(0, MAX_FILE_NAME_LENGTH)
    .replace(TRIMMED_FILE_NAME_EDGES, "");

  return `${normalized || "chatbot"}-QR.png`;
}
