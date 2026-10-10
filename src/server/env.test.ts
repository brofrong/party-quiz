import { expect, test } from "bun:test";
import { loadEnv } from "./env";

test("development defaults", () => {
  const env = loadEnv({});
  expect(env).toMatchObject({
    PORT: 3000,
    DATA_DIR: "./data",
    OIDC_ISSUER: "https://sso.brofrong.ru",
  });
  expect(env.BETTER_AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
  expect(env.devBypass).toBe(false);
  expect(loadEnv({ AUTH_DEV_BYPASS: "1" }).devBypass).toBe(true);
});

test("default auth URL follows PORT", () => {
  expect(loadEnv({ PORT: "3999" }).BETTER_AUTH_URL).toBe("http://localhost:3999");
  expect(
    loadEnv({ PORT: "3999", BETTER_AUTH_URL: "https://quiz.example.com" }).BETTER_AUTH_URL,
  ).toBe("https://quiz.example.com");
});

test("production requires secrets and ignores the dev bypass", () => {
  expect(() => loadEnv({ NODE_ENV: "production" })).toThrow("BETTER_AUTH_SECRET");
  const env = loadEnv({
    NODE_ENV: "production",
    BETTER_AUTH_SECRET: "x".repeat(40),
    OIDC_CLIENT_ID: "id",
    OIDC_CLIENT_SECRET: "secret",
    AUTH_DEV_BYPASS: "1",
  });
  expect(env.devBypass).toBe(false);
  expect(() => loadEnv({ NODE_ENV: "production", BETTER_AUTH_SECRET: "x".repeat(40) })).toThrow(
    "OIDC_CLIENT_ID",
  );
});
