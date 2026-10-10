import type { Database } from "bun:sqlite";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { anonymous } from "better-auth/plugins/anonymous";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import type { Env } from "./env";

export const SSO_PROVIDER_ID = "sso";

function authOptions(sqlite: Database, env: Env) {
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
  return {
    database: sqlite,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    trustedOrigins: [env.BETTER_AUTH_URL],
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    telemetry: { enabled: false },
    rateLimit: {
      enabled: env.NODE_ENV === "production",
      // A whole party joins at once from one Wi-Fi (one IP); the default /sign-in rule allows 3 per 10 s.
      customRules: { "/sign-in/anonymous": { window: 60, max: 1000 } },
    },
    plugins: [anonymous({ emailDomainName: "guest.party-quiz.local" }), ...sso],
  } satisfies BetterAuthOptions;
}

export function createAuth(sqlite: Database, env: Env) {
  return betterAuth(authOptions(sqlite, env));
}
export type Auth = ReturnType<typeof createAuth>;

/** Creates/updates Better Auth tables. Run before createAuth so it never sees a missing schema. */
export async function migrateAuth(sqlite: Database, env: Env): Promise<void> {
  const { runMigrations } = await getMigrations(authOptions(sqlite, env));
  await runMigrations();
}
