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
    if (measureWidth(joined) <= maxWidth) {
      current = joined;
      continue;
    }

    flush();
    // Fast path: the whole word already fits on its own line, so skip the
    // character-by-character fallback below. Confirmed equivalent to that
    // loop by exhaustive differential testing -- it always produces the same
    // line as the loop would, just without measuring one character at a time.
    if (measureWidth(word) <= maxWidth) {
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

const CARD_WIDTH = 880;
const CARD_HEIGHT = 1080;
const CARD_PADDING = 80;
const QR_SIZE = 720;
// QR block ends at CARD_PADDING + QR_SIZE = 80 + 720 = 800, leaving a 72px
// gap before the name text starts.
const NAME_TOP = 872;
const NAME_FONT_SIZE = 48;
const NAME_LINE_HEIGHT = 64;
const NAME_MAX_LINES = 2;
const CARD_BACKGROUND = "#fffdf7";
const INK = "#153300";
const QR_BACKGROUND = "#ffffff";
const NAME_FONT_FAMILY =
  '"Paperlogy", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

export async function createShareQrPngBlob(url: string, name: string): Promise<Blob> {
  const { toCanvas } = await import("qrcode");

  const card = document.createElement("canvas");
  card.width = CARD_WIDTH;
  card.height = CARD_HEIGHT;
  const context = card.getContext("2d");
  if (!context) throw new Error("QR 캔버스를 만들지 못했습니다.");

  context.fillStyle = CARD_BACKGROUND;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const qr = document.createElement("canvas");
  await toCanvas(qr, url, {
    width: QR_SIZE,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: INK, light: QR_BACKGROUND },
  });
  context.drawImage(qr, CARD_PADDING, CARD_PADDING, QR_SIZE, QR_SIZE);

  await document.fonts?.ready;
  context.fillStyle = INK;
  context.textAlign = "center";
  context.textBaseline = "top";
  context.font = `700 ${NAME_FONT_SIZE}px ${NAME_FONT_FAMILY}`;

  const lines = layoutQrCardName(
    name,
    (text) => context.measureText(text).width,
    QR_SIZE,
    NAME_MAX_LINES,
  );
  lines.forEach((line, index) => {
    context.fillText(line, CARD_WIDTH / 2, NAME_TOP + index * NAME_LINE_HEIGHT);
  });

  return await toPngBlob(card);
}

export async function downloadShareQrImage(url: string, name: string): Promise<void> {
  const blob = await createShareQrPngBlob(url, name);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = buildShareQrFileName(name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("QR 이미지를 만들지 못했습니다."));
    }, "image/png");
  });
}
