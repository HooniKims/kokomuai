# 챗봇 공유 QR 이미지 다운로드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교사가 공유를 켠 챗봇의 학생용 링크를 챗봇 이름이 함께 박힌 PNG QR 카드로 즉시 내려받게 한다.

**Architecture:** QR 생성과 카드 합성을 `src/presentation/shareQrImage.ts` 한 모듈에 격리한다. 이 모듈은 챗봇 도메인 타입을 모르고 링크 문자열과 이름 문자열만 받는다. 파일명 정규화와 줄바꿈 계산은 순수 함수로 분리해 `node` 환경에서 테스트하고, 캔버스에 그리는 부분만 DOM에 의존한다. `qrcode`는 `chatExport.ts`가 `jspdf`를 다루는 방식과 같이 동적 `import()`로 불러온다.

**Tech Stack:** TypeScript, React 19, Vite 7, Vitest 4 (`environment: "node"`), `qrcode@1.5.4`, `lucide-react`

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-07-25-chatbot-share-qr-download-design.md`
- 작업 브랜치는 `feature/share-qr-download`. `main`에 직접 커밋하지 않는다.
- 이미지 크기는 가로 880px, 세로 1080px, 형식은 PNG.
- 배경 `#fffdf7`, 잉크(QR 모듈과 이름) `#153300`, QR 바탕 `#ffffff`.
- QR 영역은 720×720px, 캔버스 상단에서 80px 아래, 가로 중앙 정렬.
- 챗봇 이름은 Paperlogy Bold 48px, 가로 중앙 정렬, 최대 가로 폭 720px, 최대 2줄, 초과 시 말줄임.
- 이미지에 링크 문자열, 학교급, 과목을 넣지 않는다. 챗봇 이름만 넣는다.
- QR에 담는 값은 `${window.location.origin}/s/${chatbot.share.publicToken}`.
- 파일명 금지문자는 `/ \ : * ? " < > |` 와 제어문자. 최대 50자. 빈 결과는 `chatbot`으로 대체. 접미사는 `-QR.png`.
- 외부 QR 생성 API를 쓰지 않는다. 공유 링크가 제3자 서버로 전송되면 안 되고 인터넷 없이 동작해야 한다.
- `vitest` 환경이 `node`라 테스트에 `document`, `window`, `HTMLCanvasElement`가 없다. DOM에 의존하는 함수는 단위 테스트하지 않고 `typeof === "function"` 스모크 검증만 한다 (`tests/presentation/chatExport.test.ts:63` 관행).
- 프로젝트는 상대 import에 `.js` 확장자를 붙인다 (`src/presentation/App.tsx:52` 참고).
- 테스트 명령은 `npm test`. 빌드 검증은 `npm run build`.

## File Structure

| 파일 | 책임 |
|---|---|
| `src/presentation/shareQrImage.ts` (신규) | 파일명 정규화, 이름 줄바꿈 계산, QR 카드 캔버스 합성, 다운로드 트리거 |
| `src/presentation/shareNotice.ts` (수정) | "저장" 알림을 "QR 저장 완료" 제목으로 변환 |
| `src/presentation/routes/TeacherDashboardRoute.tsx` (수정) | QR 다운로드 버튼 렌더 |
| `src/presentation/App.tsx` (수정) | `downloadShareQr` 핸들러와 알림 상태 연결 |
| `package.json` (수정) | `qrcode` 런타임 의존성, `@types/qrcode` 개발 의존성 |
| `tests/presentation/shareQrImage.test.ts` (신규) | 파일명과 줄바꿈 검증 |
| `tests/presentation/shareNotice.test.ts` (수정) | 저장 알림 분기 검증 |
| `tests/presentation/shareQrDownloadAction.test.ts` (신규) | 버튼 렌더와 클릭 전달 검증 |

---

### Task 1: 파일명 정규화

**Files:**
- Create: `src/presentation/shareQrImage.ts`
- Test: `tests/presentation/shareQrImage.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `buildShareQrFileName(name: string): string`

- [ ] **Step 1: Write the failing test**

`tests/presentation/shareQrImage.test.ts` 를 새로 만든다.

```ts
import { describe, expect, it } from "vitest";
import { buildShareQrFileName } from "../../src/presentation/shareQrImage";

describe("buildShareQrFileName", () => {
  it("turns a Korean chatbot name into a hyphenated png file name", () => {
    expect(buildShareQrFileName("분수의 덧셈 도우미")).toBe("분수의-덧셈-도우미-QR.png");
  });

  it("drops characters that file systems reject", () => {
    expect(buildShareQrFileName('과학/실험: 빛?')).toBe("과학실험-빛-QR.png");
  });

  it("collapses repeated whitespace into a single hyphen", () => {
    expect(buildShareQrFileName("빛의   굴절")).toBe("빛의-굴절-QR.png");
  });

  it("trims leading and trailing hyphens and dots", () => {
    expect(buildShareQrFileName("...이름...")).toBe("이름-QR.png");
  });

  it("falls back to a generic name when nothing usable remains", () => {
    expect(buildShareQrFileName("")).toBe("chatbot-QR.png");
    expect(buildShareQrFileName("   ")).toBe("chatbot-QR.png");
    expect(buildShareQrFileName('///???"')).toBe("chatbot-QR.png");
  });

  it("caps the name at fifty characters", () => {
    expect(buildShareQrFileName("가".repeat(60))).toBe(`${"가".repeat(50)}-QR.png`);
  });

  it("does not leave a dangling hyphen after capping", () => {
    expect(buildShareQrFileName(`${"가".repeat(49)} 도우미`)).toBe(`${"가".repeat(49)}-QR.png`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/presentation/shareQrImage.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/presentation/shareQrImage"`

- [ ] **Step 3: Write minimal implementation**

`src/presentation/shareQrImage.ts` 를 새로 만든다.

```ts
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
```

50자로 자른 뒤 다시 하이픈을 다듬는 이유는 자르는 위치가 하이픈에 걸릴 수 있어서다. 설계 문서의 단계 순서를 유지하면서 마지막에 한 번 더 정리한다.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/presentation/shareQrImage.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/presentation/shareQrImage.ts tests/presentation/shareQrImage.test.ts
git commit -m "Add share QR file name normalization"
```

---

### Task 2: 이름 줄바꿈과 말줄임

**Files:**
- Modify: `src/presentation/shareQrImage.ts`
- Test: `tests/presentation/shareQrImage.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `layoutQrCardName(name: string, measureWidth: (text: string) => number, maxWidth: number, maxLines: number): string[]`

폭 측정 함수를 인자로 받는 이유는 이 계산이 이 기능에서 실제로 틀릴 수 있는 유일한 부분이고, 캔버스 없이 테스트되어야 하기 때문이다. 실제 호출부는 `context.measureText(text).width` 를 넘긴다.

- [ ] **Step 1: Write the failing test**

`tests/presentation/shareQrImage.test.ts` 에 import 를 추가하고 describe 블록을 덧붙인다.

```ts
import { buildShareQrFileName, layoutQrCardName } from "../../src/presentation/shareQrImage";
```

```ts
describe("layoutQrCardName", () => {
  const measureTenPixelsPerCharacter = (text: string) => [...text].length * 10;

  it("keeps a short name on one line", () => {
    expect(layoutQrCardName("분수 도우미", measureTenPixelsPerCharacter, 100, 2)).toEqual([
      "분수 도우미",
    ]);
  });

  it("wraps at word boundaries when a name is too wide", () => {
    expect(layoutQrCardName("분수의 덧셈 도우미", measureTenPixelsPerCharacter, 100, 2)).toEqual([
      "분수의 덧셈",
      "도우미",
    ]);
  });

  it("breaks a single long word across lines", () => {
    expect(layoutQrCardName("가".repeat(15), measureTenPixelsPerCharacter, 100, 2)).toEqual([
      "가".repeat(10),
      "가".repeat(5),
    ]);
  });

  it("ellipsizes the last line when the name needs more than the allowed lines", () => {
    expect(layoutQrCardName("가".repeat(25), measureTenPixelsPerCharacter, 100, 2)).toEqual([
      "가".repeat(10),
      `${"가".repeat(9)}…`,
    ]);
  });

  it("returns no lines for an empty or blank name", () => {
    expect(layoutQrCardName("", measureTenPixelsPerCharacter, 100, 2)).toEqual([]);
    expect(layoutQrCardName("   ", measureTenPixelsPerCharacter, 100, 2)).toEqual([]);
  });

  it("collapses repeated whitespace before measuring", () => {
    expect(layoutQrCardName("  분수   도우미  ", measureTenPixelsPerCharacter, 100, 2)).toEqual([
      "분수 도우미",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/presentation/shareQrImage.test.ts`
Expected: FAIL — `layoutQrCardName is not a function`

- [ ] **Step 3: Write minimal implementation**

`src/presentation/shareQrImage.ts` 에 추가한다.

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/presentation/shareQrImage.test.ts`
Expected: PASS — 13 tests

- [ ] **Step 5: Commit**

```bash
git add src/presentation/shareQrImage.ts tests/presentation/shareQrImage.test.ts
git commit -m "Add QR card name wrapping and ellipsis"
```

---

### Task 3: QR 카드 합성과 다운로드

**Files:**
- Modify: `package.json`
- Modify: `src/presentation/shareQrImage.ts`
- Test: `tests/presentation/shareQrImage.test.ts`

**Interfaces:**
- Consumes: `buildShareQrFileName` (Task 1), `layoutQrCardName` (Task 2)
- Produces: `createShareQrPngBlob(url: string, name: string): Promise<Blob>`, `downloadShareQrImage(url: string, name: string): Promise<void>`

`vitest` 환경이 `node`라 캔버스를 단위 테스트할 수 없다. 두 함수는 `chatExport.test.ts:63` 과 같은 방식으로 export 존재만 검증하고, 실제 이미지는 Task 6에서 브라우저로 확인한다.

- [ ] **Step 1: 의존성 추가**

```bash
npm install qrcode@1.5.4
npm install --save-dev @types/qrcode@1.5.6
```

`qrcode` 는 `pngjs`, `yargs`, `dijkstrajs` 를 의존성으로 가지지만, 패키지의 `browser` 필드가 `lib/index.js` 를 `lib/browser.js` 로 바꾸고 `fs` 를 `false` 로 만든다. Vite 가 이 필드를 존중하므로 노드 전용 의존성은 브라우저 번들에 들어가지 않는다.

- [ ] **Step 2: Write the failing test**

`tests/presentation/shareQrImage.test.ts` 의 import 를 확장한다.

```ts
import {
  buildShareQrFileName,
  createShareQrPngBlob,
  downloadShareQrImage,
  layoutQrCardName,
} from "../../src/presentation/shareQrImage";
```

describe 블록을 덧붙인다.

```ts
describe("share QR image factories", () => {
  it("exposes blob creation and download as functions instead of running at import time", () => {
    expect(typeof createShareQrPngBlob).toBe("function");
    expect(typeof downloadShareQrImage).toBe("function");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/presentation/shareQrImage.test.ts`
Expected: FAIL — `expected "undefined" to be "function"`

- [ ] **Step 4: Write minimal implementation**

`src/presentation/shareQrImage.ts` 에 추가한다.

```ts
const CARD_WIDTH = 880;
const CARD_HEIGHT = 1080;
const CARD_PADDING = 80;
const QR_SIZE = 720;
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
```

`qrcode` 는 named import 로 가져와야 한다. `@types/qrcode@1.5.6` 은 `export function toCanvas(...)` 형태의 named export 만 선언하고 default export 가 없다. `chatExport.ts` 의 `const { default: jsPDF }` 패턴을 그대로 따라 하면 타입이 맞지 않는다.

폰트 로드를 기다리는 `await document.fonts?.ready` 는 폭을 재기 전에 와야 한다. 그러지 않으면 측정한 폭과 실제로 그려지는 폭이 달라져 줄바꿈이 틀린다. `document.fonts` 가 없는 브라우저에서는 기본 산세리프로 그려지고 이는 오류로 취급하지 않는다.

`NAME_TOP` 872 는 QR 아래끝(80 + 720 = 800)에서 72px 떨어진 위치다. 두 줄이면 마지막 글자 아래끝이 872 + 64 + 48 = 984 로 캔버스 안에 들어간다.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/presentation/shareQrImage.test.ts`
Expected: PASS — 14 tests

- [ ] **Step 6: 타입 검사와 전체 테스트**

Run: `npm run build && npm test`
Expected: 빌드 성공, 전체 테스트 통과. `package.json` 에 `qrcode` 가 `dependencies`, `@types/qrcode` 가 `devDependencies` 로 들어갔는지 확인한다. `tests/infrastructure/packageManifest.test.ts` 는 `vite` 가 런타임 의존성에 없는지만 검사하므로 영향받지 않는다.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/presentation/shareQrImage.ts tests/presentation/shareQrImage.test.ts
git commit -m "Compose share QR card PNG with chatbot name"
```

---

### Task 4: 저장 알림 분기

**Files:**
- Modify: `src/presentation/shareNotice.ts:22-29`
- Test: `tests/presentation/shareNotice.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `formatShareNotice("QR 이미지를 저장했습니다.")` 가 `{ title: "QR 저장 완료", tone: "success" }` 를 반환

기존 규칙은 "생성", "복사", "준비" 만 알아본다. "저장" 분기가 없으면 QR 알림 제목이 "알림" 으로 떨어진다.

- [ ] **Step 1: Write the failing test**

`tests/presentation/shareNotice.test.ts` 의 `"keeps plain notices visible..."` 테스트 앞에 추가한다.

```ts
  it("highlights a saved QR image as a completed save action", () => {
    expect(formatShareNotice("QR 이미지를 저장했습니다.")).toEqual({
      title: "QR 저장 완료",
      detail: "QR 이미지를 저장했습니다.",
      url: "",
      tone: "success"
    });
  });
```

`url` 이 빈 문자열인 이유는 메시지에 `: ` 구분자가 없기 때문이다. 덕분에 알림 카드에 링크 `code` 블록이 나타나지 않는다.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/presentation/shareNotice.test.ts`
Expected: FAIL — 받은 값의 `title` 이 `"알림"`, `tone` 이 `"default"`

- [ ] **Step 3: Write minimal implementation**

`src/presentation/shareNotice.ts` 의 "복사" 분기 바로 뒤, "준비" 분기 앞에 넣는다.

```ts
  if (detail.includes("저장")) {
    return {
      title: "QR 저장 완료",
      detail,
      url,
      tone: "success"
    };
  }
```

기존 알림 문구 중 "저장" 을 포함하는 것은 없다. 생성·복사·준비·삭제 문구와 실패 문구 모두 겹치지 않으므로 기존 분기 판정이 바뀌지 않는다.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/presentation/shareNotice.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/presentation/shareNotice.ts tests/presentation/shareNotice.test.ts
git commit -m "Title QR save notices as a completed save action"
```

---

### Task 5: 대시보드 버튼과 핸들러 연결

**Files:**
- Modify: `src/presentation/routes/TeacherDashboardRoute.tsx:1`, `:52`, `:85`, `:329-331`
- Modify: `src/presentation/App.tsx:1300-1306`, `:1537`
- Test: `tests/presentation/shareQrDownloadAction.test.ts`

**Interfaces:**
- Consumes: `downloadShareQrImage` (Task 3)
- Produces: `TeacherDashboardRouteProps.downloadShareQr: (chatbot: ManagedChatbot) => Promise<void>`, 버튼의 `data-action="download-share-qr"`

버튼에 `data-action` 을 붙이는 이유는 이 프로젝트의 테스트가 React 렌더러 없이 element 트리를 순회하며 `props["data-action"]` 으로 노드를 찾기 때문이다 (`tests/presentation/teacherChatbotCreationFocus.test.ts` 의 `apply-topic-suggestion` 등).

- [ ] **Step 1: Write the failing test**

`tests/presentation/shareQrDownloadAction.test.ts` 를 새로 만든다.

```ts
import { describe, expect, it, vi } from "vitest";
import { TeacherDashboardRoute } from "../../src/presentation/routes/TeacherDashboardRoute";
import type { ManagedChatbot } from "../../src/domain/chatbot/chatbotManagement";

describe("share QR download action", () => {
  it("offers a QR download for a shared chatbot and passes it to the handler", () => {
    const downloadShareQr = vi.fn();
    const shared = chatbot({ enabled: true });
    const tree = TeacherDashboardRoute(baseProps({
      chatbots: [shared],
      downloadShareQr,
    }));

    const trigger = collectNodes(tree).find(
      (node) => node.props?.["data-action"] === "download-share-qr",
    );

    expect(trigger).toBeDefined();
    expect(collectText(trigger).join(" ")).toContain("QR 다운로드");

    clickNode(trigger);
    expect(downloadShareQr).toHaveBeenCalledWith(shared);
  });

  it("hides the QR download until sharing is enabled", () => {
    const tree = TeacherDashboardRoute(baseProps({
      chatbots: [chatbot({ enabled: false })],
      downloadShareQr: vi.fn(),
    }));

    const trigger = collectNodes(tree).find(
      (node) => node.props?.["data-action"] === "download-share-qr",
    );

    expect(trigger).toBeUndefined();
  });
});

function baseProps(
  overrides: Partial<Parameters<typeof TeacherDashboardRoute>[0]>,
): Parameters<typeof TeacherDashboardRoute>[0] {
  return {
    workspaceStatus: "교사 계정으로 연결됐습니다.",
    chatbots: [],
    usageConversationCount: 0,
    usageAiCallCount: 0,
    usageInputTokenCount: 0,
    usageOutputTokenCount: 0,
    usageEstimatedCostKrw: 0,
    activeTeacherId: "teacher-1",
    chatbotForm: {
      name: "",
      schoolLevel: "middle",
      topic: "",
      learningGoal: "",
      subject: "",
      gradeBand: "",
      persona: "",
      hintStrength: "medium",
      questionLevel: "medium",
    },
    setChatbotForm: vi.fn(),
    curriculumRecommendations: [],
    selectedCurriculumChunkIds: [],
    toggleCurriculumChunkSelection: vi.fn(),
    selectedChatbotIds: [],
    toggleChatbotSelection: vi.fn(),
    toggleAllChatbotSelection: vi.fn(),
    showAllCurriculumRecommendations: false,
    setShowAllCurriculumRecommendations: vi.fn(),
    createLocalChatbot: vi.fn(),
    enableLocalShare: vi.fn(),
    requestLocalChatbotDeletion: vi.fn(),
    cancelLocalChatbotDeletion: vi.fn(),
    deleteLocalChatbot: vi.fn(),
    pendingDeleteChatbotId: "",
    requestSelectedLocalChatbotsDeletion: vi.fn(),
    deleteSelectedLocalChatbots: vi.fn(),
    pendingSelectedDelete: false,
    copyShareLink: vi.fn(),
    downloadShareQr: vi.fn(),
    shareNotice: "",
    shareNoticeChatbotId: "",
    ...overrides,
  };
}

function chatbot({ enabled }: { enabled: boolean }): ManagedChatbot {
  return {
    id: "chatbot-1",
    ownerTeacherId: "teacher-1",
    name: "분수의 덧셈 도우미",
    schoolLevel: "elementary",
    gradeBand: "5-6",
    subject: "수학",
    topic: "분수의 덧셈",
    learningGoal: "분모가 다른 분수를 더한다.",
    hintStrength: "medium",
    questionLevel: "easy",
    persona: "수학 선생님",
    curriculumLinks: [],
    lifecycle: { status: "active" },
    share: {
      enabled,
      publicToken: enabled ? "public-token" : "",
      expiresAt: null,
    },
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
  };
}

function collectNodes(
  node: unknown,
): Array<{ props?: Record<string, unknown>; type?: unknown }> {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectNodes);

  const props =
    "props" in node
      ? ((node as { props?: { children?: unknown } }).props ?? {})
      : {};
  return [
    node as { props?: Record<string, unknown>; type?: unknown },
    ...collectNodes(props.children),
  ];
}

function collectText(node: unknown): string[] {
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectText);

  const props =
    "props" in node
      ? ((node as { props?: { children?: unknown } }).props ?? {})
      : {};
  return collectText(props.children);
}

function clickNode(node: { props?: Record<string, unknown> } | undefined): void {
  const onClick = node?.props?.onClick;
  if (typeof onClick === "function") onClick();
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/presentation/shareQrDownloadAction.test.ts`
Expected: FAIL — `expected undefined not to be undefined` (버튼이 없음). 타입 오류로 `downloadShareQr` 가 props 에 없다는 경고도 함께 난다.

- [ ] **Step 3: props 인터페이스에 핸들러 추가**

`src/presentation/routes/TeacherDashboardRoute.tsx:52` 의 `copyShareLink` 선언 바로 아래에 넣는다.

```ts
  downloadShareQr: (chatbot: ManagedChatbot) => Promise<void>;
```

`:85` 의 구조 분해에서 `copyShareLink,` 바로 아래에 넣는다.

```ts
  downloadShareQr,
```

- [ ] **Step 4: 아이콘 import 확장**

`src/presentation/routes/TeacherDashboardRoute.tsx:1` 을 바꾼다.

```ts
import { Calendar, Check, CheckCircle2, Copy, Eraser, ExternalLink, QrCode } from "lucide-react";
```

- [ ] **Step 5: 버튼 렌더**

`src/presentation/routes/TeacherDashboardRoute.tsx:329-331` 의 링크 복사 버튼 바로 아래에 넣는다.

```tsx
                      <button
                        className="pill outline"
                        data-action="download-share-qr"
                        onClick={() => void downloadShareQr(chatbot)}
                        type="button"
                      >
                        <QrCode size={16} /> QR 다운로드
                      </button>
```

공유가 켜진 분기(`chatbot.share.enabled` 가 참인 `<>...</>`) 안에 넣어야 한다. 공유가 꺼진 챗봇에는 버튼이 나오지 않는다.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/presentation/shareQrDownloadAction.test.ts`
Expected: PASS — 2 tests

- [ ] **Step 7: App.tsx 핸들러 추가**

`src/presentation/App.tsx` 의 `copyShareLink` 함수(`:1300-1306`) 바로 아래에 넣는다.

```ts
  async function downloadShareQr(chatbot: ManagedChatbot) {
    if (!chatbot.share.publicToken) return;
    const shareUrl = `${window.location.origin}/s/${chatbot.share.publicToken}`;
    try {
      await downloadShareQrImage(shareUrl, chatbot.name);
      setShareNoticeChatbotId(chatbot.id);
      setShareNotice("QR 이미지를 저장했습니다.");
    } catch (caught) {
      setShareNoticeChatbotId(chatbot.id);
      setShareNotice(
        caught instanceof Error
          ? caught.message
          : "QR 이미지를 만들지 못했습니다.",
      );
    }
  }
```

`src/presentation/App.tsx` 의 import 목록에 추가한다.

```ts
import { downloadShareQrImage } from "./shareQrImage.js";
```

- [ ] **Step 8: prop 전달**

`src/presentation/App.tsx:1537` 의 `copyShareLink={copyShareLink}` 바로 아래에 넣는다.

```tsx
          downloadShareQr={downloadShareQr}
```

- [ ] **Step 9: 전체 테스트와 빌드**

Run: `npm run build && npm test`
Expected: 빌드 성공, 전체 테스트 통과

- [ ] **Step 10: Commit**

```bash
git add src/presentation/App.tsx src/presentation/routes/TeacherDashboardRoute.tsx tests/presentation/shareQrDownloadAction.test.ts
git commit -m "Add QR download button to teacher chatbot list"
```

---

### Task 6: 브라우저 수동 검증

**Files:**
- 변경 없음

**Interfaces:**
- Consumes: Task 1-5 전체
- Produces: 없음

자동 테스트는 `node` 환경이라 캔버스에 실제로 그려진 결과를 확인할 수 없다. 이미지가 눈으로 맞는지, QR 이 실제로 읽히는지는 여기서만 검증된다.

- [ ] **Step 1: 개발 서버 실행**

Run: `npm run dev:full`
브라우저에서 표시된 주소를 연다.

- [ ] **Step 2: 짧은 이름으로 확인**

교사로 로그인해 이름이 `분수의 덧셈 도우미` 인 챗봇을 만들고 공유를 켠다. "QR 다운로드" 를 누른다.

확인할 것:
- 파일이 `분수의-덧셈-도우미-QR.png` 로 저장된다
- 이미지 크기가 880×1080 이다
- 배경이 크림색, QR 모듈과 이름이 진녹색이다
- 이름이 한 줄로 QR 아래 가운데 있고 잘리지 않는다
- 링크 문자열, 학교급, 과목이 이미지에 없다
- 챗봇 행에 "QR 저장 완료" 알림이 뜨고, 링크 `code` 블록은 없다

- [ ] **Step 3: 휴대전화로 QR 스캔**

저장한 PNG 를 화면에 띄우고 휴대전화 카메라로 읽는다.
Expected: 학생용 채팅 화면(`/s/{token}`)이 열린다.

- [ ] **Step 4: 긴 이름으로 줄바꿈과 말줄임 확인**

이름이 `분모가 다른 분수의 덧셈과 뺄셈을 단계별로 함께 풀어보는 수학 도우미 챗봇` 인 챗봇을 만들어 공유를 켜고 QR 을 내려받는다.

확인할 것:
- 이름이 2줄까지만 그려진다
- 셋째 줄로 넘칠 내용은 둘째 줄 끝에 `…` 로 표시된다
- 이름이 QR 폭(720px)을 넘지 않는다
- 이름이 캔버스 아래로 잘려나가지 않는다

- [ ] **Step 5: 공유 꺼진 챗봇 확인**

공유를 켜지 않은 챗봇 행에 "QR 다운로드" 버튼이 없고 "공유 켜기" 만 있는지 확인한다.

- [ ] **Step 6: 번들 확인**

Run: `npm run build`
Expected: `qrcode` 가 별도 청크로 분리되고, 초기 청크에 들어가지 않는다. 빌드 출력에서 `qrcode` 관련 청크 이름을 확인한다.

- [ ] **Step 7: Commit (변경이 있으면)**

수동 검증에서 고친 것이 있으면 커밋한다. 없으면 이 단계를 넘긴다.

```bash
git add -A
git commit -m "Fix issues found in QR download manual verification"
```
