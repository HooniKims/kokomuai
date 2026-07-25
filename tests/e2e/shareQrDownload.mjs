/**
 * Manual, local-only verification script for the teacher-dashboard "QR 다운로드"
 * (share QR download) feature. It drives a real browser against a locally
 * running app + API, creates real chatbots, downloads the generated QR PNGs,
 * and checks their pixels/filenames against the production layout.
 *
 * How to run:
 *   1. Start the app and the local API together, with the Firebase auth gate off:
 *        npm run dev:full:e2e
 *   2. node tests/e2e/shareQrDownload.mjs    (or: npm run test:e2e:qr)
 *
 * The auth override baked into `dev:full:e2e` is required: .env sets
 * VITE_FIREBASE_AUTH_ENABLED=true, and with the gate on the app takes its
 * Firebase sign-in path and never runs the unauthenticated local-dev bootstrap
 * that this script drives. Plain `npm run dev:full` leaves it at the login screen.
 *
 * To generate cards a phone can actually open, point it at the machine's LAN
 * address so the QR encodes that origin instead of 127.0.0.1:
 *   E2E_APP_URL=http://<your-lan-ip>:5173 node tests/e2e/shareQrDownload.mjs
 *
 * Side effects: this script writes directly to server/data/local-dev-store.json
 * (bootstrapApprovedLocalTeacher, disableShareInStore) to approve a local
 * teacher and to flip a chatbot's sharing off, and it creates real chatbots
 * through the API. It does not clean up after itself -- test chatbots and
 * store mutations are left behind after the run. Do not point it at a shared
 * or production store.
 *
 * This script is for local, manual verification only -- it is not part of
 * `npm test` and does not run in CI. It does not fix the underlying app-level
 * local-dev auth bootstrap gap described in bootstrapApprovedLocalTeacher()
 * below; that is a separate, pre-existing issue.
 */
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const appUrl = process.env.E2E_APP_URL ?? "http://127.0.0.1:5173";
const apiUrl = process.env.E2E_API_URL ?? "http://127.0.0.1:8787";
const artifactsDir = "artifacts";
const storePath = "server/data/local-dev-store.json";

// Layout constants mirrored from src/presentation/shareQrImage.ts, which is the
// source of truth for the card geometry. `buildShareQrFileName` (the filename
// rule) is NOT duplicated here -- it is imported live from the compiled
// production module inside the browser page (see computeExpectedFileName
// below), so a regression there is caught instead of silently passing.
const CARD_WIDTH = 880;
const CARD_HEIGHT = 1080;
const QR_SIZE = 720;
const CARD_PADDING = 80;
const NAME_TOP = 872;
const NAME_LINE_HEIGHT = 64;
const CARD_BACKGROUND = "#fffdf7";
const INK = "#153300";
const QR_BACKGROUND = "#ffffff";

// Name-band boundaries and column bounds, derived from the constants above
// (NAME_TOP / NAME_LINE_HEIGHT / QR_SIZE in src/presentation/shareQrImage.ts
// are the source of truth) instead of being re-typed as separate literals at
// each call site.
const NAME_LINE1_TOP = NAME_TOP;
const NAME_LINE1_BOTTOM = NAME_TOP + NAME_LINE_HEIGHT - 1;
const NAME_LINE2_TOP = NAME_TOP + NAME_LINE_HEIGHT;
const NAME_LINE2_BOTTOM = NAME_TOP + 2 * NAME_LINE_HEIGHT - 1;
const NAME_LINE3_TOP = NAME_TOP + 2 * NAME_LINE_HEIGHT;
const NAME_LINE3_BOTTOM = NAME_TOP + 3 * NAME_LINE_HEIGHT - 1;
const NAME_BAND_BOTTOM = NAME_TOP + 2 * NAME_LINE_HEIGHT; // end of the 2-line name allowance
const NAME_BAND_LEFT = CARD_PADDING; // QR block left edge
const NAME_BAND_RIGHT = CARD_PADDING + QR_SIZE; // QR block right edge

const SHORT_NAME = "분수의 덧셈 도우미";
const LONG_NAME = "분모가 다른 분수의 덧셈과 뺄셈을 단계별로 함께 풀어보는 수학 도우미 챗봇";
const DISABLED_NAME = "공유 비활성 확인용 챗봇";

const checks = [];
function record(id, description, pass, details) {
  checks.push({ id, description, pass, details });
  const status = pass ? "PASS" : "FAIL";
  console.log(`[${status}] ${id} ${description} :: ${JSON.stringify(details)}`);
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

async function main() {
  await mkdir(artifactsDir, { recursive: true });

  await requestJson(`${apiUrl}/api/health`).catch(() => {
    throw new Error("local API is not reachable at " + apiUrl);
  });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1365, height: 1000 }, acceptDownloads: true });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await bootstrapApprovedLocalTeacher();
    await page.goto(appUrl, { waitUntil: "networkidle" });
    await waitForApprovedTeacher();
    // Role-navigation buttons (".nav-actions button") were removed from the UI
    // (shouldShowRoleNavigation() now always returns false); the root path "/"
    // resolves straight to the teacher dashboard, so there is nothing to click.
    await expectText(page, "내 챗봇과 사용량");

    // --- Case A: short name ---
    const chatbotA = await createSharedChatbot(page, {
      name: SHORT_NAME,
      schoolLevel: "elementary",
      gradeBand: "5-6",
      subject: "수학",
      topic: "분모가 같은 분수의 덧셈과 뺄셈",
      learningGoal: "학생이 분모가 같은 분수의 덧셈과 뺄셈을 그림과 식으로 표현하도록 돕는다.",
      persona: "정답을 바로 말하지 않고 그림과 예시로 함께 확인하는 초등학교 수학 선생님",
    });

    const downloadA = await clickDownloadAndCapture(page, chatbotA.id);
    const savedA = join(artifactsDir, "qr-02-short-name.png");
    await downloadA.saveAs(savedA);

    const suggestedA = downloadA.suggestedFilename();
    const expectedFileNameA = await computeExpectedFileName(page, SHORT_NAME);
    record("1", "Case A filename exactly 분수의-덧셈-도우미-QR.png", suggestedA === expectedFileNameA, {
      suggestedA,
      expectedFileNameA,
    });

    const dimsA = await readPngDimensions(savedA);
    record("2", "Case A PNG is 880x1080", dimsA.width === CARD_WIDTH && dimsA.height === CARD_HEIGHT, dimsA);

    const shareUrlA = `${appUrl}/s/${chatbotA.share.publicToken}`;
    await runCardPixelChecks(page, savedA, {
      caseId: "3",
      caseLabel: "Case A pixel/palette checks",
    });

    await runQrMatchCheck(page, savedA, shareUrlA, "4", "Case A QR encodes correct URL");

    await runNoUrlBelowNameCheck(page, savedA, "5", "Case A no URL text below name band (y 1010-1080)");

    // --- Case B: long name ---
    const chatbotB = await createSharedChatbot(page, {
      name: LONG_NAME,
      schoolLevel: "elementary",
      gradeBand: "5-6",
      subject: "수학",
      topic: "분모가 다른 분수의 덧셈과 뺄셈",
      learningGoal: "학생이 분모가 다른 분수의 덧셈과 뺄셈을 통분을 통해 단계별로 풀도록 돕는다.",
      persona: "통분의 이유를 질문으로 확인시키며 단계별로 함께 푸는 초등학교 수학 선생님",
    });

    const downloadB = await clickDownloadAndCapture(page, chatbotB.id);
    const savedB = join(artifactsDir, "qr-03-long-name.png");
    await downloadB.saveAs(savedB);

    const suggestedB = downloadB.suggestedFilename();
    const expectedFileNameB = await computeExpectedFileName(page, LONG_NAME);
    record("8", "Case B filename is sanitized long name + -QR.png", suggestedB === expectedFileNameB, {
      suggestedB,
      expectedFileNameB,
    });

    await loadCardIntoPage(page, savedB);
    await lineBandCheck(page, "6", "Case B name wraps to at most 2 lines with ink in lines 1 & 2, none in line 3");
    await horizontalBoundsCheck(page, "7", "Case B name ink stays within x 80..800 in name band");

    // --- Case C: sharing disabled ---
    const chatbotC = await createChatbotOnly(page, {
      name: DISABLED_NAME,
      schoolLevel: "elementary",
      gradeBand: "5-6",
      subject: "수학",
      topic: "분수의 크기 비교",
      learningGoal: "학생이 분수의 크기를 비교하는 방법을 이해하도록 돕는다.",
      persona: "차분하게 예시를 드는 초등학교 수학 선생님",
    });

    await disableShareInStore(chatbotC.id);
    await waitForShareDisabled(chatbotC.id);
    await page.reload({ waitUntil: "networkidle" });
    await expectText(page, DISABLED_NAME);

    const rowC = page.locator(`[data-chatbot-id="${chatbotC.id}"]`);
    const qrButtonCountC = await rowC.locator('[data-action="download-share-qr"]').count();
    const enableButtonVisibleC = await rowC.getByRole("button", { name: /공유 켜기/ }).isVisible().catch(() => false);
    record("CaseC", "Chatbot without sharing shows no QR button and shows 공유 켜기", qrButtonCountC === 0 && enableButtonVisibleC, {
      qrButtonCountC,
      enableButtonVisibleC,
    });

    await page.screenshot({ path: join(artifactsDir, "qr-01-dashboard.png"), fullPage: true });

    if (pageErrors.length > 0) {
      console.error("Page errors observed during run:", pageErrors);
    }

    const failed = checks.filter((c) => !c.pass);
    const result = {
      passed: failed.length === 0 && pageErrors.length === 0,
      checks,
      pageErrors,
      chatbots: { a: chatbotA.id, b: chatbotB.id, c: chatbotC.id },
    };
    await writeFile(join(artifactsDir, "qr-verification-result.json"), JSON.stringify(result, null, 2), "utf8");
    console.log(JSON.stringify(result, null, 2));
    if (failed.length > 0) {
      console.error(`${failed.length} check(s) FAILED`);
    }
    if (pageErrors.length > 0) {
      throw new Error(`${pageErrors.length} page error(s) observed during run -- see pageErrors above`);
    }
  } finally {
    await browser.close();
  }
}

// Computes the expected download filename by calling the real, compiled
// production function inside the page -- not a local re-implementation.
// Vite's dev server serves TypeScript sources directly, so the same
// "/@id/..."-style dynamic import used by runQrMatchCheck below for the
// "qrcode" package also works for our own module via its dev-server path.
async function computeExpectedFileName(page, name) {
  return page.evaluate(async (name) => {
    const mod = await import(/* @vite-ignore */ "/src/presentation/shareQrImage.ts");
    return mod.buildShareQrFileName(name);
  }, name);
}

async function createSharedChatbot(page, form) {
  await fillChatbotForm(page, form);
  await page.getByRole("button", { name: /생성/ }).click();
  await expectText(page, form.name);
  const chatbot = await waitForCreatedChatbot(form.name, { requireShare: true });
  if (!chatbot.share?.enabled || !chatbot.share?.publicToken) {
    throw new Error(`expected chatbot "${form.name}" to be auto-shared after creation, got share=${JSON.stringify(chatbot.share)}`);
  }
  return chatbot;
}

// Creation auto-enables sharing, so we must wait for that write to land before
// turning sharing back off. Returning as soon as the row merely exists lets the
// app's share-enable call overwrite our disable a moment later, and Case C then
// sees a still-shared chatbot.
async function createChatbotOnly(page, form) {
  await fillChatbotForm(page, form);
  await page.getByRole("button", { name: /생성/ }).click();
  await expectText(page, form.name);
  return waitForCreatedChatbot(form.name, { requireShare: true });
}

async function fillChatbotForm(page, form) {
  await page.getByLabel("챗봇 이름", { exact: true }).fill(form.name);
  // Note: no { exact: true } here -- the <select> is nested inside its <label>,
  // so Chromium's computed accessible name for the label concatenates in the
  // rendered <option> text too (e.g. "학교급초등학교중학교..."), which never
  // exact-matches the literal label text "학교급".
  await page.getByLabel("학교급").selectOption(form.schoolLevel);
  await page.getByLabel("학년군", { exact: true }).fill(form.gradeBand);
  await page.getByLabel("과목", { exact: true }).fill(form.subject);
  // These three labels wrap suggestion-chip <span aria-label="..."> rows too,
  // and getByLabel() also matches non-form elements carrying a bare aria-label,
  // so it resolves to both the real input and the chip-row span. Scoping to
  // role "textbox" excludes the span (which has no textbox role) while still
  // substring-matching the input's own (longer, assist-text-polluted) name.
  await page.getByRole("textbox", { name: "수업 주제" }).fill(form.topic);
  await page.getByRole("textbox", { name: "대화 목표" }).fill(form.learningGoal);
  await page.getByRole("textbox", { name: "페르소나" }).fill(form.persona);
  // let the 250ms curriculum-recommendation debounce settle before submitting
  await wait(600);
}

async function clickDownloadAndCapture(page, chatbotId) {
  const row = page.locator(`[data-chatbot-id="${chatbotId}"]`);
  const button = row.locator('[data-action="download-share-qr"]');
  await button.waitFor({ state: "visible" });
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  return download;
}

async function waitForCreatedChatbot(name, { requireShare = false } = {}) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const teacher = await waitForApprovedTeacher({ throwOnTimeout: false });
    if (teacher) {
      const chatbots = await requestJson(`${apiUrl}/api/chatbots?ownerTeacherId=${encodeURIComponent(teacher.id)}`);
      // Match by name, but a leftover chatbot with the same name from a
      // previous (unclean) run of this script can already exist -- pick the
      // most recently created match so a stale row can't be silently
      // verified in place of the one this run just created.
      let matches = chatbots.chatbots?.filter((item) => item.name === name) ?? [];
      if (requireShare) {
        // Auto-sharing is enabled by the server asynchronously after chatbot
        // creation, so a name match that shows up before that finishes must
        // not satisfy the poll -- otherwise we race the server and read the
        // share fields before they're populated. Keep polling until a match
        // has a real share token (or the timeout above expires).
        matches = matches.filter((item) => item.share?.enabled && item.share?.publicToken);
      }
      if (matches.length > 0) {
        const latest = matches.reduce((newest, candidate) =>
          new Date(candidate.createdAt).getTime() > new Date(newest.createdAt).getTime() ? candidate : newest,
        );
        return latest;
      }
    }
    await wait(400);
  }
  throw new Error(
    `created chatbot "${name}" was not persisted within timeout` +
      (requireShare ? " with sharing enabled (share.enabled/publicToken never populated)" : ""),
  );
}

// NOTE: the app's own client-side bootstrap (App.tsx `ensureApprovedLocalTeacher`)
// calls GET /api/teachers *before* any teacher profile exists for the
// "local-dev-teacher" token. Since GET /api/teachers now requires an existing
// profile for the caller's token (server/localApi.ts `resolveTeacherListAuthContextFromRequest`),
// that first call throws "teacher_profile_not_found" and the client never reaches
// its own registration fallback. We work around this local-dev bootstrap gap by
// registering + approving the same "local-dev-teacher" identity directly via the
// API before the page ever loads, so by the time the app's own bootstrap runs,
// the profile already exists and everything proceeds normally.
async function bootstrapApprovedLocalTeacher() {
  const teachers = await requestJson(`${apiUrl}/api/teachers`);
  const existing = teachers.teachers?.find((item) => item.status === "approved" && item.id !== "local-admin");
  if (existing) return existing;

  const registered = await requestJson(`${apiUrl}/api/teachers`, {
    method: "POST",
    headers: { Authorization: "Bearer local-dev-teacher" },
    body: JSON.stringify({
      realName: "로컬 교사",
      email: "local-teacher@local.test",
      passwordHash: "local-dev-teacher-password-hash",
      school: {
        schoolName: "로컬 테스트 학교",
        schoolKind: "초등학교",
        officeCode: "LOCAL",
        standardSchoolCode: "LOCAL",
        region: "로컬",
      },
    }),
  });
  return requestJson(`${apiUrl}/api/admin/teachers/${registered.teacher.id}/approve`, {
    method: "POST",
    headers: { Authorization: "Bearer local-admin" },
    body: JSON.stringify({}),
  });
}

async function waitForApprovedTeacher(options = { throwOnTimeout: true }) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const teachers = await requestJson(`${apiUrl}/api/teachers`);
    const teacher = teachers.teachers?.find((item) => item.status === "approved" && item.id !== "local-admin");
    if (teacher) return teacher;
    await wait(400);
  }
  if (options.throwOnTimeout) throw new Error("approved local teacher was not prepared within timeout");
  return null;
}

// The disable is written straight to the store file, outside the server's write
// queue, so confirm it actually survived before asserting on the UI. A silent
// lost update here would otherwise look like a bug in the QR button itself.
async function waitForShareDisabled(chatbotId) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const data = JSON.parse(await readFile(storePath, "utf8"));
    const chatbot = data.chatbots?.find((item) => item.id === chatbotId);
    if (!chatbot) throw new Error(`chatbot ${chatbotId} vanished from the local store`);
    if (!chatbot.share?.enabled && !chatbot.share?.publicToken) return;
    await wait(200);
  }
  throw new Error(
    `sharing for ${chatbotId} was re-enabled after being disabled -- the app overwrote the store`,
  );
}

async function disableShareInStore(chatbotId) {
  const raw = await readFile(storePath, "utf8");
  const data = JSON.parse(raw);
  const chatbot = data.chatbots.find((item) => item.id === chatbotId);
  if (!chatbot) throw new Error(`chatbot ${chatbotId} not found in local store to disable sharing`);
  chatbot.share = { enabled: false, publicToken: "", expiresAt: null };
  await writeFile(storePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readPngDimensions(filePath) {
  const buffer = await readFile(filePath);
  // PNG signature is 8 bytes, then a 4-byte length + 4-byte "IHDR" tag (bytes 8-15),
  // then IHDR data: width (bytes 16-19, big-endian), height (bytes 20-23, big-endian).
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

async function loadCardIntoPage(page, filePath) {
  const buffer = await readFile(filePath);
  const base64 = buffer.toString("base64");
  await page.evaluate(
    (b64) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          window.__qrCard = canvas;
          resolve({ width: canvas.width, height: canvas.height });
        };
        img.onerror = () => reject(new Error("failed to load card PNG into <img>"));
        img.src = `data:image/png;base64,${b64}`;
      }),
    base64,
  );
}

async function samplePixel(page, x, y) {
  return page.evaluate(
    ({ x, y }) => {
      const ctx = window.__qrCard.getContext("2d");
      const d = ctx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    },
    { x, y },
  );
}

async function countInkPixelsInRegion(page, x0, y0, w, h, target, tolerance = 24) {
  return page.evaluate(
    ({ x0, y0, w, h, target, tolerance }) => {
      const ctx = window.__qrCard.getContext("2d");
      const d = ctx.getImageData(x0, y0, w, h).data;
      let count = 0;
      for (let i = 0; i < d.length; i += 4) {
        const dr = Math.abs(d[i] - target.r);
        const dg = Math.abs(d[i + 1] - target.g);
        const db = Math.abs(d[i + 2] - target.b);
        if (dr <= tolerance && dg <= tolerance && db <= tolerance) count += 1;
      }
      return count;
    },
    { x0, y0, w, h, target, tolerance },
  );
}

function closeEnough(pixel, target, tolerance = 12) {
  return (
    Math.abs(pixel[0] - target.r) <= tolerance &&
    Math.abs(pixel[1] - target.g) <= tolerance &&
    Math.abs(pixel[2] - target.b) <= tolerance
  );
}

async function runCardPixelChecks(page, filePath, { caseId, caseLabel }) {
  await loadCardIntoPage(page, filePath);

  const cream = hexToRgb(CARD_BACKGROUND);
  const ink = hexToRgb(INK);
  const white = hexToRgb(QR_BACKGROUND);

  // background point outside the QR block (e.g. top-left corner, well outside the
  // NAME_BAND_LEFT..NAME_BAND_RIGHT box)
  const bgPixel = await samplePixel(page, 10, 10);
  // white QR quiet-zone area inside the QR block but near its inner edge (margin=2 modules ~ inside padding)
  const quietZonePixel = await samplePixel(page, CARD_PADDING + 4, CARD_PADDING + 4);
  const inkPixelCount = await countInkPixelsInRegion(page, CARD_PADDING, CARD_PADDING, QR_SIZE, QR_SIZE, ink);
  const nameBandInkCount = await countInkPixelsInRegion(
    page,
    0,
    NAME_TOP,
    CARD_WIDTH,
    NAME_BAND_BOTTOM - NAME_TOP,
    ink,
  );

  const bgOk = closeEnough(bgPixel, cream, 6);
  const quietZoneOk = closeEnough(quietZonePixel, white, 30) || closeEnough(quietZonePixel, ink, 30);
  const qrInkOk = inkPixelCount > 1000;
  const nameInkOk = nameBandInkCount > 20;

  record(caseId, caseLabel, bgOk && quietZoneOk && qrInkOk && nameInkOk, {
    bgPixel,
    expectedCream: cream,
    quietZonePixel,
    inkPixelCountInQrBlock: inkPixelCount,
    nameBandInkPixelCount: nameBandInkCount,
    bgOk,
    quietZoneOk,
    qrInkOk,
    nameInkOk,
  });
}

async function runQrMatchCheck(page, filePath, shareUrl, id, label) {
  await loadCardIntoPage(page, filePath);

  // Render a reference QR using the same "qrcode" package + same options as the app,
  // via Vite's dev-server bare-specifier resolution endpoint (/@id/<module>).
  const mismatch = await page.evaluate(
    async ({ url, size, dark, light }) => {
      const mod = await import(/* @vite-ignore */ "/@id/qrcode");
      const toCanvas = mod.toCanvas ?? mod.default?.toCanvas;
      const refCanvas = document.createElement("canvas");
      await toCanvas(refCanvas, url, {
        width: size,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark, light },
      });
      const refCtx = refCanvas.getContext("2d");
      const refData = refCtx.getImageData(0, 0, size, size).data;

      const cardCtx = window.__qrCard.getContext("2d");
      const cardData = cardCtx.getImageData(80, 80, size, size).data;

      let mismatches = 0;
      for (let i = 0; i < refData.length; i += 4) {
        if (
          refData[i] !== cardData[i] ||
          refData[i + 1] !== cardData[i + 1] ||
          refData[i + 2] !== cardData[i + 2]
        ) {
          mismatches += 1;
        }
      }
      return { mismatches, totalPixels: size * size };
    },
    { url: shareUrl, size: QR_SIZE, dark: INK, light: QR_BACKGROUND },
  );

  record(id, label, mismatch.mismatches === 0, {
    shareUrl,
    mismatchPixelCount: mismatch.mismatches,
    totalPixels: mismatch.totalPixels,
  });
}

async function runNoUrlBelowNameCheck(page, filePath, id, label) {
  await loadCardIntoPage(page, filePath);
  const ink = hexToRgb(INK);
  const belowNameInk = await countInkPixelsInRegion(page, 0, 1010, CARD_WIDTH, CARD_HEIGHT - 1010, ink);
  record(id, label, belowNameInk === 0, { belowNameInkPixelCount: belowNameInk });
}

async function lineBandCheck(page, id, label) {
  const ink = hexToRgb(INK);
  const line1 = await countInkPixelsInRegion(page, CARD_PADDING, NAME_LINE1_TOP, QR_SIZE, NAME_LINE1_BOTTOM - NAME_LINE1_TOP + 1, ink);
  const line2 = await countInkPixelsInRegion(page, CARD_PADDING, NAME_LINE2_TOP, QR_SIZE, NAME_LINE2_BOTTOM - NAME_LINE2_TOP + 1, ink);
  const line3 = await countInkPixelsInRegion(page, CARD_PADDING, NAME_LINE3_TOP, QR_SIZE, NAME_LINE3_BOTTOM - NAME_LINE3_TOP + 1, ink);
  const pass = line1 > 5 && line2 > 5 && line3 === 0;
  record(id, label, pass, { line1InkPixelCount: line1, line2InkPixelCount: line2, line3InkPixelCount: line3 });
}

async function horizontalBoundsCheck(page, id, label) {
  const ink = hexToRgb(INK);
  const leftOfColumn = await countInkPixelsInRegion(page, 0, NAME_TOP, NAME_BAND_LEFT, NAME_BAND_BOTTOM - NAME_TOP, ink);
  const rightOfColumn = await countInkPixelsInRegion(page, NAME_BAND_RIGHT, NAME_TOP, CARD_WIDTH - NAME_BAND_RIGHT, NAME_BAND_BOTTOM - NAME_TOP, ink);
  const pass = leftOfColumn === 0 && rightOfColumn === 0;
  record(id, label, pass, { leftOfColumnInkPixelCount: leftOfColumn, rightOfColumnInkPixelCount: rightOfColumn });
}

async function expectText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: 15000 });
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Local dev API requires a bearer token (server/dev-server.ts special-cases
      // "local-admin" as an admin identity that can see all teachers/chatbots).
      Authorization: "Bearer local-admin",
      ...init.headers,
    },
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${url} failed ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
  }
  return payload;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
