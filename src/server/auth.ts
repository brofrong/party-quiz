import type { Database } from "bun:sqlite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { anonymous } from "better-auth/plugins/anonymous";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import type { Env } from "./env";

export const SSO_PROVIDER_ID = "sso";

export function createAuth(sqlite: Database, env: Env) {
  const sso =
    env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET
      ? [
          genericOAuth({
            config: [
              {
                providerId: SSO_PROVIDER_ID,
                discoveryUrl: `${env.OIDC_ISSUER}/.well-known/openid-configuration`,
                clientId: env.OIDC_CLIENT_ID,
                clientSecret: env.OIDC_CLIENT_SECRET,
                scopes: ["openid", "profile", "email"],
                pkce: true,
              },
            ],
          }),
        ]
      : [];
  return betterAuth({
    database: sqlite,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    trustedOrigins: [env.BETTER_AUTH_URL],
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    telemetry: { enabled: false },
    plugins: [anonymous({ emailDomainName: "guest.party-quiz.local" }), ...sso],
  });
}
export type Auth = ReturnType<typeof createAuth>;

export async function migrateAuth(auth: Auth): Promise<void> {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
}
