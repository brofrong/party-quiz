import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTRPCClient, createWSClient, httpBatchLink, wsLink } from "@trpc/client";
import type { FrameRevealPublicView } from "@/quizzes/frame-reveal/schema";
import type { PlayerSnapshot } from "@/shared/game";
import { makeContent } from "@/test/fixtures";
import { createServer } from "./app";
import { loadEnv } from "./env";
import type { AppRouter } from "./trpc/router";

let app: Awaited<ReturnType<typeof createServer>>;
let base: string;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), "app-"));
  const contentDir = join(root, "content");
  const mediaDir = join(root, "media");
  mkdirSync(contentDir);
  mkdirSync(mediaDir);
  writeFileSync(
    join(contentDir, "frames.json"),
    JSON.stringify({
      id: "frames",
      type: "frame-reveal",
      title: "Угадай кадр",
      content: makeContent(["a", "b"]),
    }),
  );
  writeFileSync(join(mediaDir, "0000000000000001-1280.avif"), "fake");
  app = await createServer({
    env: loadEnv({ PORT: "0", DATA_DIR: join(root, "data"), AUTH_DEV_BYPASS: "1" }),
    pages: { player: () => new Response("player"), admin: () => new Response("admin") },
    contentDir,
    mediaDir,
  });
  base = `http://localhost:${app.server.port}`;
});
afterAll(() => app.close());

test("health, pages and media", async () => {
  expect(await (await fetch(`${base}/api/health`)).json()).toEqual({ ok: true });
  expect(await (await fetch(`${base}/admin/anything`)).text()).toBe("admin");
  const media = await fetch(`${base}/media/0000000000000001-1280.avif`);
  expect(media.status).toBe(200);
  expect(media.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  expect(media.headers.get("content-type")).toBe("image/avif");
  expect((await fetch(`${base}/media/..%2Fapp.db`)).status).toBe(404);
  expect((await fetch(`${base}/media/0000000000000002-1280.avif`)).status).toBe(404);
});

test("guest over WebSocket follows the host in realtime", async () => {
  const signIn = await fetch(`${base}/api/auth/sign-in/anonymous`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: "{}",
  });
  const guestCookie = (signIn.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  expect(guestCookie).toContain("session_token");

  class CookieWebSocket extends WebSocket {
    constructor(url: string | URL) {
      // Bun extension: custom headers on the upgrade request
      super(url, { headers: { cookie: guestCookie } } as unknown as string[]);
    }
  }
  const wsClient = createWSClient({
    url: `${base.replace("http", "ws")}/api/trpc`,
    WebSocket: CookieWebSocket,
  });
  const guest = createTRPCClient<AppRouter>({ links: [wsLink({ client: wsClient })] });
  const hostClient = createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `${base}/api/trpc`, headers: { cookie: "dev_host=1" } })],
  });

  const snapshots: PlayerSnapshot[] = [];
  const waitFor = (pred: (s: PlayerSnapshot) => boolean) =>
    new Promise<PlayerSnapshot>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 3000);
      const check = () => {
        const hit = snapshots.find(pred);
        if (hit) {
          clearTimeout(timer);
          resolve(hit);
        } else setTimeout(check, 10);
      };
      check();
    });
  const sub = guest.game.onState.subscribe(undefined, { onData: (s) => snapshots.push(s) });

  await waitFor((s) => s.status === "lobby" && s.online === 1);
  expect(await hostClient.me.query()).toMatchObject({ isHost: true });
  await hostClient.game.start.mutate({ quizId: "frames" });
  const playing = await waitFor((s) => s.status === "playing");
  expect((playing as { view: FrameRevealPublicView }).view.answer).toBeNull();
  await hostClient.game.dispatch.mutate({ action: { type: "reveal", animation: "shatter" } });
  const revealed = await waitFor(
    (s) => s.status === "playing" && (s.view as FrameRevealPublicView).answer !== null,
  );
  expect((revealed as { view: FrameRevealPublicView }).view.answer).toBe("Ответ a");

  sub.unsubscribe();
  wsClient.close();
});
