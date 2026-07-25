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

const ELLIPSIS = "…";

export function layoutQrCardName(
  name: string,
  measureWidth: (text: string) => number,
  maxWidth: number,
  maxLines: number,
): string[] {
  const normalized = name.replace(/\s+/g, " ").trim();
  if (!normalized || maxLines < 1 || maxWidth <= 0) return [];

  const lines: string[] = [];
  let current = "";

  function flush() {
    if (current) lines.push(current);
    current = "";
  }

  for (const word of normalized.split(" ")) {
    const joined = current ? `${current} ${word}` : word;
    if (measureWidth(joined) < maxWidth) {
      current = joined;
      continue;
    }

    flush();
    if (measureWidth(word) < maxWidth) {
      current = word;
      continue;
    }

    for (const character of [...word]) {
      const grown = current + character;
      if (current && measureWidth(grown) > maxWidth) {
        flush();
        current = character;
        continue;
      }
      current = grown;
    }
  }
  flush();

  if (lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = ellipsize(kept[maxLines - 1], measureWidth, maxWidth);
  return kept;
}

function ellipsize(
  line: string,
  measureWidth: (text: string) => number,
  maxWidth: number,
): string {
  const characters = [...line];
  while (characters.length > 0) {
    const candidate = `${characters.join("")}${ELLIPSIS}`;
    if (measureWidth(candidate) <= maxWidth) return candidate;
    characters.pop();
  }
  return ELLIPSIS;
}
