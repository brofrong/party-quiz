import { anonymousClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ plugins: [anonymousClient()] });

/** Every guest device gets a silent anonymous session before opening the WebSocket. */
export async function ensureGuestSession(): Promise<void> {
  const { data } = await authClient.getSession();
  if (data) return;
  const res = await authClient.signIn.anonymous();
  if (res.error) throw new Error(res.error.message ?? "Не удалось создать гостевую сессию");
}
