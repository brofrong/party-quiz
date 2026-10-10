import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "./app";
import { loadEnv } from "./env";

let app: Awaited<ReturnType<typeof createServer>>;
let base: string;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), "auth-"));
  mkdirSync(join(root, "content"));
  mkdirSync(join(root, "media"));
  const env = loadEnv({
    NODE_ENV: "production",
    PORT: "0",
    DATA_DIR: join(root, "data"),
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "x".repeat(40),
    OIDC_ISSUER: "http://127.0.0.1:9",
    OIDC_CLIENT_ID: "id",
    OIDC_CLIENT_SECRET: "secret",
  });
  app = await createServer({
    env,
    pages: { player: () => new Response("player"), admin: () => new Response("admin") },
    contentDir: join(root, "content"),
    mediaDir: join(root, "media"),
  });
  base = `http://localhost:${app.server.port}`;
});
afterAll(() => app.close());

test("a party's worth of guests behind one IP can all join at once in production", async () => {
  const statuses = await Promise.all(
    Array.from({ length: 40 }, () =>
      fetch(`${base}/api/auth/sign-in/anonymous`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          "x-forwarded-for": "203.0.113.7",
        },
        body: "{}",
      }).then((r) => r.status),
    ),
  );
  expect(statuses.filter((s) => s !== 200)).toEqual([]);
});
