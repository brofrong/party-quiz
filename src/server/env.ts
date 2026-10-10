import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(0).default(3000),
  DATA_DIR: z.string().default("./data"),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  OIDC_ISSUER: z.url().default("https://sso.brofrong.ru"),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  AUTH_DEV_BYPASS: z.enum(["0", "1"]).default("0"),
});

export type Env = Omit<z.infer<typeof schema>, "AUTH_DEV_BYPASS" | "BETTER_AUTH_SECRET"> & {
  BETTER_AUTH_SECRET: string;
  devBypass: boolean;
};

const DEV_SECRET = "dev-only-secret-do-not-use-in-production-0000";

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const { AUTH_DEV_BYPASS, BETTER_AUTH_SECRET, ...e } = schema.parse(source);
  const prod = e.NODE_ENV === "production";
  if (prod && !BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET обязателен в production (минимум 32 символа)");
  }
  if (prod && (!e.OIDC_CLIENT_ID || !e.OIDC_CLIENT_SECRET)) {
    throw new Error("OIDC_CLIENT_ID и OIDC_CLIENT_SECRET обязательны в production");
  }
  return {
    ...e,
    OIDC_ISSUER: e.OIDC_ISSUER.replace(/\/$/, ""),
    BETTER_AUTH_SECRET: BETTER_AUTH_SECRET ?? DEV_SECRET,
    devBypass: !prod && AUTH_DEV_BYPASS === "1",
  };
}
