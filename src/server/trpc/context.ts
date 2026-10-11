import type { MediaRef } from "@/shared/media";
import type { Auth } from "../auth";
import type { GameEngine } from "../engine";
import type { QuizRepo } from "../repo";

export type CtxUser = { id: string; name: string; isAnonymous: boolean };
export type Context = {
  user: CtxUser | null;
  engine: GameEngine;
  repo: QuizRepo;
  /** Whether every compressed variant of a picture exists on this server. */
  hasMedia: (ref: MediaRef) => boolean;
  /** Stores a guest's display name in their session user. */
  renameUser: (userId: string, name: string) => void;
};

export const DEV_HOST_COOKIE = "dev_host";
const DEV_HOST_RE = new RegExp(`(?:^|;\\s*)${DEV_HOST_COOKIE}=1(?:;|$)`);

export function createContextFactory(deps: {
  auth: Auth;
  engine: GameEngine;
  repo: QuizRepo;
  hasMedia: (ref: MediaRef) => boolean;
  renameUser: (userId: string, name: string) => void;
  devBypass: boolean;
}) {
  return async (headers: Headers): Promise<Context> => {
    const base = {
      engine: deps.engine,
      repo: deps.repo,
      hasMedia: deps.hasMedia,
      renameUser: deps.renameUser,
    };
    if (deps.devBypass && DEV_HOST_RE.test(headers.get("cookie") ?? "")) {
      return { ...base, user: { id: "dev-host", name: "Dev Host", isAnonymous: false } };
    }
    const session = await deps.auth.api.getSession({ headers });
    const user = session
      ? {
          id: session.user.id,
          name: session.user.name,
          isAnonymous: Boolean(session.user.isAnonymous),
        }
      : null;
    return { ...base, user };
  };
}
