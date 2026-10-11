import { z } from "zod";

export const PLAYER_NAME_MAX = 24;
export const playerNameSchema = z
  .string()
  .trim()
  .min(1, "Напиши имя")
  .max(PLAYER_NAME_MAX, `Не длиннее ${PLAYER_NAME_MAX} символов`);

/** Better Auth's default name for anonymous sessions — the guest has not introduced themselves. */
const ANONYMOUS_DEFAULT = "Anonymous";

export const hasPlayerName = (user: { name: string; isAnonymous: boolean } | null): boolean =>
  Boolean(user?.name.trim()) && !(user?.isAnonymous && user.name === ANONYMOUS_DEFAULT);
