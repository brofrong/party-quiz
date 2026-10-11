/** Manual browser e2e: bun run e2e (needs Google Chrome; override with CHROME_PATH). */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer, { type Page } from "puppeteer-core";

const PORT = 3999;
const base = `http://localhost:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), "party-quiz-e2e-"));

function startServer() {
  return Bun.spawn(["bun", "src/server/index.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: dataDir,
      AUTH_DEV_BYPASS: "1",
      NODE_ENV: "development",
    },
    stdout: "inherit",
    stderr: "inherit",
  });
}
async function waitHealthy() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {}
    await Bun.sleep(100);
  }
  throw new Error("server did not start");
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`E2E: ${msg}`);
}
// Headless Chrome pauses rAF in background tabs (motion transitions stall), so focus first.
async function focus(p: Page) {
  await p.bringToFront();
  return p;
}
const counter = (p: Page) =>
  p.$eval('[data-testid="slide-counter"]', (e) => e.textContent?.trim() ?? "");
const waitCounter = async (p: Page, prefix: string) =>
  (await focus(p)).waitForFunction(
    (pre) =>
      document.querySelector('[data-testid="slide-counter"]')?.textContent?.trim().startsWith(pre),
    { timeout: 15000 },
    prefix,
  );

let server = startServer();
await waitHealthy();
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  // Separate contexts so every screen is a distinct device/session.
  const tvCtx = await browser.createBrowserContext();
  const phoneCtx = await browser.createBrowserContext();
  const host = await browser.newPage();
  await host.setViewport({ width: 1400, height: 900 });
  await host.goto(`${base}/api/dev/host-login`);

  const tv = await tvCtx.newPage();
  await tv.setViewport({ width: 1920, height: 1080 });
  const phone = await phoneCtx.newPage();
  await phone.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 3 });
  const guests = [tv, phone];
  for (const [name, p] of [
    ["host", host],
    ["tv", tv],
    ["phone", phone],
  ] as const) {
    p.on("pageerror", (e) => console.error(`[${name}] pageerror`, e));
    p.on("response", async (r) => {
      if (r.url().includes("/api/auth") && !r.ok()) {
        console.error(`[${name}] ${r.status()} ${r.url()}`, await r.text().catch(() => ""));
      }
    });
  }
  for (const g of guests) {
    await (await focus(g)).goto(base);
    await g.waitForSelector('[data-testid="lobby"]', { timeout: 10000 }).catch(async (e) => {
      console.error("page text:", await g.evaluate(() => document.body.innerText));
      throw e;
    });
  }
  await focus(tv);
  await tv.waitForFunction(
    () => document.querySelector('[data-testid="lobby"]')?.textContent?.includes("2 устройства"),
    { timeout: 5000 },
  );

  await focus(host);
  await host.waitForSelector('[data-testid="start-frames"]');
  await host.click('[data-testid="start-frames"]');
  for (const g of guests) await waitCounter(g, "1 /");
  await focus(host);
  await host.waitForSelector('[data-testid="host-answer"]');
  const answer = await host.$eval(
    '[data-testid="host-answer"]',
    (e) => e.textContent?.trim() ?? "",
  );
  assert(answer.length > 1, "host sees the answer");
  for (const g of guests)
    assert(!(await g.content()).includes(answer), "answer leaked before reveal");

  for (const g of guests) {
    await (await focus(g)).waitForSelector('[data-testid="cover"]');
    await Bun.sleep(600); // let the slide fade-in settle
    const inside = await g.evaluate(() => {
      const box = document.querySelector('[data-testid="frame-box"]')?.getBoundingClientRect();
      if (!box) return false;
      return [...document.querySelectorAll('[data-testid="cover"]')].every((c) => {
        const r = c.getBoundingClientRect();
        return (
          r.left >= box.left - 1 &&
          r.right <= box.right + 1 &&
          r.top >= box.top - 1 &&
          r.bottom <= box.bottom + 1
        );
      });
    });
    assert(inside, "covers lie inside the image box");
  }

  await focus(host);
  await host.keyboard.press("Space");
  for (const g of guests) {
    await (await focus(g)).waitForFunction(
      (a) => document.querySelector('[data-testid="answer"]')?.textContent?.includes(a),
      { timeout: 5000 },
      answer,
    );
  }

  const lateCtx = await browser.createBrowserContext();
  const late = await lateCtx.newPage();
  await late.goto(base);
  await late.waitForSelector('[data-testid="answer"]');
  assert((await late.$$('[data-testid="cover"]')).length === 0, "late guest must not see covers");
  await lateCtx.close();

  await (await focus(tv)).screenshot({ path: "/tmp/party-quiz-tv.png" });
  await (await focus(phone)).screenshot({ path: "/tmp/party-quiz-phone.png" });

  // Restart the server: guests reconnect and resume from persisted state.
  server.kill();
  await server.exited;
  server = startServer();
  await waitHealthy();
  await (await focus(host)).reload();
  await host.waitForSelector('[data-testid="host-answer"]');
  await host.keyboard.press("ArrowRight");
  for (const g of guests) await waitCounter(g, "2 /");
  const final = `tv: ${await counter(tv)}, phone: ${await counter(phone)}`;

  // Host ends the game (with confirmation): every screen returns to the lobby.
  await focus(host);
  await host.click('[data-testid="end-game"]');
  await host.waitForSelector('[data-testid="end-game-confirm"]', { timeout: 5000 });
  await host.click('[data-testid="end-game-confirm"]');
  for (const g of guests) {
    await (await focus(g)).waitForSelector('[data-testid="lobby"]', { timeout: 10000 });
  }

  // Import a quiz file through the admin (how edits move from localhost to prod).
  const api = (path: string) =>
    fetch(`${base}/api/trpc/${path}`, { headers: { cookie: "dev_host=1" } });
  const exported = (
    await (await api(`quiz.export?input=${encodeURIComponent('{"quizId":"frames"}')}`)).json()
  ).result.data;
  exported.content.slides[0].answer = "Импортированный ответ";
  const filePath = join(dataDir, "frames-import.json");
  await Bun.write(filePath, JSON.stringify(exported));
  await focus(host);
  await host.waitForSelector('[data-testid="import-file-frames"]');
  const input = await host.$('[data-testid="import-file-frames"]');
  await (input as unknown as { uploadFile(p: string): Promise<void> }).uploadFile(filePath);
  await host.waitForSelector('[data-testid="import-confirm"]', { timeout: 5000 });
  await host.click('[data-testid="import-confirm"]');
  await host.waitForFunction(
    () => document.querySelector("[data-sonner-toast]")?.textContent?.includes("Загружено"),
    { timeout: 5000 },
  );
  const after = (
    await (await api(`quiz.get?input=${encodeURIComponent('{"quizId":"frames"}')}`)).json()
  ).result.data;
  assert(after.content.slides[0].answer === "Импортированный ответ", "import replaced the content");

  // «Что ответит Аня?»: the birthday person answers in the console, two phones vote.
  const phone2Ctx = await browser.createBrowserContext();
  const phone2 = await phone2Ctx.newPage();
  await phone2.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 3 });
  phone2.on("pageerror", (e) => console.error("[phone2] pageerror", e));
  await (await focus(phone2)).goto(base);
  await phone2.waitForSelector('[data-testid="lobby"]');
  const voters = [phone, phone2];
  const screens = [tv, ...voters];
  await focus(host);
  await host.click('[data-testid="start-birthday"]');
  for (const g of screens) {
    await (await focus(g)).waitForSelector('[data-testid="bg-waiting"]', { timeout: 10000 });
  }
  await focus(host);
  await host.waitForSelector('[data-testid="bg-answer-input"]');
  await host.type('[data-testid="bg-answer-input"]', "Пицца");
  await host.click('[data-testid="bg-answer-submit"]');
  await host.waitForSelector('[data-testid="bg-start-voting"]:not([disabled])');
  for (const g of screens) assert(!(await g.content()).includes("Пицца"), "answer leaked early");
  await host.screenshot({ path: "/tmp/party-quiz-bg-host.png" });
  await host.click('[data-testid="bg-start-voting"]');

  const optionIndex = (p: Page, wanted: boolean) =>
    p.$$eval(
      '[data-testid^="bg-option-"]',
      (els, want) => els.findIndex((e) => e.textContent?.includes("Пицца") === want),
      wanted,
    );
  const voteAs = async (p: Page, name: string, correct: boolean) => {
    await (await focus(p)).waitForSelector('[data-testid="bg-option-0"]', { timeout: 10000 });
    await p.click(`[data-testid="bg-option-${await optionIndex(p, correct)}"]`);
    await p.waitForSelector('[data-testid="name-input"]', { timeout: 5000 });
    await p.type('[data-testid="name-input"]', name);
    await p.click('[data-testid="name-save"]');
    await p.waitForFunction(
      (n) => document.querySelector('[data-testid="bg-me"]')?.textContent?.includes(n),
      { timeout: 5000 },
      name,
    );
  };
  await voteAs(phone, "Петя", true);
  await voteAs(phone2, "Вася", false);
  await (await focus(tv)).waitForFunction(
    () => document.querySelector('[data-testid="bg-voted"]')?.textContent?.includes("2"),
    { timeout: 5000 },
  );
  await focus(host);
  await host.click('[data-testid="bg-reveal"]');
  const result = async (p: Page, text: string) =>
    (await focus(p)).waitForFunction(
      (t) => document.querySelector('[data-testid="bg-result"]')?.textContent?.includes(t),
      { timeout: 5000 },
      text,
    );
  await result(phone, "Угадал");
  await result(phone2, "Мимо");
  await (await focus(tv)).waitForSelector('[data-correct="true"]');
  assert((await tv.$('[data-testid="bg-result"]')) === null, "the TV did not vote");
  await focus(phone);
  await Bun.sleep(1500); // let the reveal animations finish for the screenshots
  await phone.screenshot({ path: "/tmp/party-quiz-bg-phone.png" });
  await focus(tv);
  await Bun.sleep(1500);
  await tv.screenshot({ path: "/tmp/party-quiz-bg-tv.png" });

  // Scores survive a restart.
  server.kill();
  await server.exited;
  server = startServer();
  await waitHealthy();
  await (await focus(host)).reload();
  await host.waitForSelector('[data-testid="bg-scores"]');
  await host.click('[data-testid="bg-scores"]');
  await (await focus(tv)).waitForFunction(
    () => {
      const t = document.querySelector('[data-testid="bg-leaderboard"]')?.textContent ?? "";
      return /Петя\s*1/.test(t) && /Вася\s*0/.test(t);
    },
    { timeout: 10000 },
  );
  await Bun.sleep(1500);
  await tv.screenshot({ path: "/tmp/party-quiz-bg-scores.png" });
  await phone2Ctx.close();
  console.log(`E2E OK (${final}, ended → lobby, import ok, birthday votes + scores ok)`);
} finally {
  await browser.close();
  server.kill();
}
