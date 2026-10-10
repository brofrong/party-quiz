import { anonymousClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ plugins: [anonymousClient()] });

let pending: Promise<void> | null = null;

/**
 * Every guest device gets a silent anonymous session before opening the WebSocket.
 * Shared promise: concurrent callers (e.g. StrictMode double effects) must not sign in twice.
 */
export function ensureGuestSession(): Promise<void> {
  pending ??= signInIfNeeded().catch((err) => {
    pending = null;
    throw err;
  });
  return pending;
}

async function signInIfNeeded(): Promise<void> {
  const { data } = await authClient.getSession();
  if (data) return;
  const res = await authClient.signIn.anonymous();
  if (res.error) throw new Error(res.error.message ?? "Не удалось создать гостевую сессию");
}
