import { chromium } from "playwright";
import { rm, mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const appUrl = process.env.E2E_APP_URL ?? "http://127.0.0.1:5173";
const apiUrl = process.env.E2E_API_URL ?? "http://127.0.0.1:8787";
const attempts = Number(process.env.E2E_ATTEMPTS ?? process.argv.find((arg) => arg.startsWith("--attempts="))?.split("=")[1] ?? 5);
const aiModelId = process.env.E2E_AI_MODEL_ID ?? "";
const artifactsDir = "artifacts";
const storePath = "server/data/local-dev-store.json";

const topic = "중1 국어 9품사에 대한 이해";

async function main() {
  await mkdir(artifactsDir, { recursive: true });
  await removeOldScreenshots();

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await runScenario(attempt);
      await rm(join(artifactsDir, "local-full-korean-nine-parts-last-failure.json"), { force: true });
      await writeFile(join(artifactsDir, "local-full-korean-nine-parts-result.json"), JSON.stringify(result, null, 2), "utf8");
      console.log(JSON.stringify(result, null, 2));
      return;
    } catch (error) {
      lastError = error;
      const failure = {
        attempt,
        message: error instanceof Error ? error.message : String(error)
      };
      await writeFile(join(artifactsDir, "local-full-korean-nine-parts-last-failure.json"), JSON.stringify(failure, null, 2), "utf8");
      console.error(`attempt ${attempt} failed: ${failure.message}`);
      await wait(1200);
    }
  }

  throw lastError;
}

async function runScenario(attempt) {
  await resetLocalStore();
  await ensureServersReady();
  await configureAiModelIfRequested();

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } });
  const errors = [];
  const resourceWarnings = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") resourceWarnings.push(message.text());
  });

  try {
    await page.goto(appUrl, { waitUntil: "networkidle" });
    await waitForApprovedTeacher();

    await page.locator(".nav-actions button").nth(1).click();
    await expectText(page, "로컬 교사");
    await page.screenshot({ path: join(artifactsDir, "01-admin-approved.png"), fullPage: true });

    await page.locator(".nav-actions button").nth(0).click();
    await fillTeacherForm(page);
    await expectText(page, "[9국04-03]");
    await page.getByRole("button", { name: /생성/ }).click();
    await expectText(page, "중1 국어 9품사 이해");
    const createdChatbot = await waitForCreatedChatbot();
    if (createdChatbot.schoolLevel !== "middle") {
      throw new Error(`created chatbot schoolLevel was ${createdChatbot.schoolLevel}, expected middle`);
    }
    if (!createdChatbot.curriculumLinks.some((link) => link.achievement.includes("[9국04-03]"))) {
      throw new Error(`created chatbot did not link [9국04-03]: ${JSON.stringify(createdChatbot.curriculumLinks)}`);
    }

    let shareUrl = createdChatbot.share?.publicToken ? `${appUrl}/s/${createdChatbot.share.publicToken}` : "";
    if (!shareUrl) {
      await page.getByRole("button", { name: /공유 켜기/ }).first().click();
      await expectText(page, "공유 링크가 준비됐습니다");
      const shareNotice = await page.locator(".admin-log").last().textContent();
      shareUrl = extractShareUrl(shareNotice ?? "");
    } else {
      await expectText(page, "학생용 링크가 준비됐습니다");
      await page.getByLabel(`학생용 챗봇 바로가기: ${createdChatbot.name}`).waitFor({ state: "visible" });
    }
    await page.screenshot({ path: join(artifactsDir, "02-teacher-chatbot-shared.png"), fullPage: true });

    await page.goto(shareUrl, { waitUntil: "networkidle" });
    await expectText(page, topic);
    await page.screenshot({ path: join(artifactsDir, "03-student-share-open.png"), fullPage: true });

    await page.locator("textarea").fill("9품사가 무엇인지 예문으로 구분하는 방법을 알고 싶어요.");
    await page.locator(".round-send").click();
    const assistantText = await waitForAssistantText(page);
    await page.screenshot({ path: join(artifactsDir, "04-student-gemma-response.png"), fullPage: true });

    if (errors.length > 0) {
      throw new Error(`page errors: ${errors.join(" | ")}`);
    }
    if (!assistantText.includes("품사") && !assistantText.includes("단어")) {
      throw new Error(`assistant response did not stay on Korean grammar topic: ${assistantText.slice(0, 120)}`);
    }
    const usageSummary = await waitForUsageSummary(createdChatbot);

    return {
      passed: true,
      attempt,
      teacherId: createdChatbot.ownerTeacherId,
      chatbotId: createdChatbot.id,
      shareUrl,
      topic,
      curriculumAchievement: createdChatbot.curriculumLinks[0]?.achievement ?? "",
      assistantTextLength: assistantText.length,
      usageConversationCount: usageSummary.conversationCount,
      usageAiCallCount: usageSummary.aiCallCount,
      resourceWarnings,
      screenshots: [
        "artifacts/01-admin-approved.png",
        "artifacts/02-teacher-chatbot-shared.png",
        "artifacts/03-student-share-open.png",
        "artifacts/04-student-gemma-response.png"
      ],
      errors
    };
  } finally {
    await browser.close();
  }
}

async function removeOldScreenshots() {
  const entries = await readdir(artifactsDir, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries.map((entry) => {
      const path = join(artifactsDir, entry.name);
      if (entry.isDirectory()) return removeScreenshotsIn(path);
      if (/\.(png|jpe?g|webp)$/i.test(entry.name)) return rm(path, { force: true });
      return Promise.resolve();
    })
  );
}

async function resetLocalStore() {
  await rm(storePath, { force: true });
}

async function ensureServersReady() {
  const health = await requestJson(`${apiUrl}/api/health`);
  if (!health.ok) throw new Error("local API health check failed");

  const response = await fetch(appUrl);
  if (!response.ok) throw new Error(`Vite app check failed: ${response.status}`);
}

async function configureAiModelIfRequested() {
  if (!aiModelId) return;

  await requestJson(`${apiUrl}/api/admin/ai-settings`, {
    method: "PATCH",
    body: JSON.stringify({
      adminId: "local-admin",
      modelId: aiModelId
    })
  });
}

async function removeScreenshotsIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return removeScreenshotsIn(path);
      if (/\.(png|jpe?g|webp)$/i.test(entry.name)) return rm(path, { force: true });
      return Promise.resolve();
    })
  );
}

async function fillTeacherForm(page) {
  await page.getByLabel("챗봇 이름").fill("중1 국어 9품사 이해");
  await page.getByLabel("학교급").selectOption("middle");
  await page.getByLabel("학년군").fill("1");
  await page.getByLabel("과목").fill("국어");
  await page.getByLabel("수업 주제").fill(topic);
  await page
    .getByLabel("대화 목표")
    .fill("학생이 명사, 대명사, 수사, 동사, 형용사, 관형사, 부사, 조사, 감탄사의 역할을 예문 속에서 구분하도록 돕는다.");
  await page.getByLabel("페르소나").fill("정답을 바로 말하지 않고 예문을 함께 살피며 질문으로 이끄는 중학교 국어 선생님");
}

async function waitForCreatedChatbot() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const teacher = await waitForApprovedTeacher({ throwOnTimeout: false });
    if (teacher) {
      const chatbots = await requestJson(`${apiUrl}/api/chatbots?ownerTeacherId=${encodeURIComponent(teacher.id)}`);
      const chatbot = chatbots.chatbots?.find((item) => item.name === "중1 국어 9품사 이해");
      if (chatbot) return chatbot;
    }
    await wait(500);
  }
  throw new Error("created chatbot was not persisted within timeout");
}

async function waitForUsageSummary(chatbot) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const payload = await requestJson(`${apiUrl}/api/usage`);
    const summary = payload.summaries?.find(
      (item) => item.teacherId === chatbot.ownerTeacherId && item.chatbotId === chatbot.id
    );
    if (summary?.conversationCount > 0 && summary?.aiCallCount > 0) return summary;
    await wait(500);
  }
  throw new Error("student-share usage summary was not recorded within timeout");
}

async function waitForApprovedTeacher(options = { throwOnTimeout: true }) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const teachers = await requestJson(`${apiUrl}/api/teachers`);
    const teacher = teachers.teachers?.find((item) => item.status === "approved" && item.id !== "local-admin");
    if (teacher) return teacher;
    await wait(500);
  }
  if (options.throwOnTimeout) throw new Error("approved local teacher was not prepared within timeout");
  return null;
}

function extractShareUrl(text) {
  const match = text.match(/https?:\/\/\S+/);
  if (!match) throw new Error(`share URL was not found in notice: ${text}`);
  return match[0];
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...init.headers
    }
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

async function expectText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: 15000 });
}

async function waitForAssistantText(page) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const messages = await page.locator(".message.assistant p").allTextContents();
    const latest = messages.at(-1)?.trim() ?? "";
    const sendButtonVisible = await page.getByLabel("질문 보내기").isVisible().catch(() => false);
    if (latest.length >= 40 && sendButtonVisible) return latest;
    await wait(800);
  }
  throw new Error("assistant response did not finish with at least 40 characters within timeout");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
