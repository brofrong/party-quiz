import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { HTMLBundle } from "bun";
import { createBunHttpHandler, createBunWSHandler } from "trpc-bun-adapter";
import { MEDIA_FILE_RE } from "@/shared/media";
import { createAuth, migrateAuth } from "./auth";
import { openDatabase } from "./db";
import { GameEngine } from "./engine";
import type { Env } from "./env";
import { createQuizRepo, createSessionStore } from "./repo";
import { loadSeedFiles, seedMissing } from "./seed";
import { createContextFactory, DEV_HOST_COOKIE } from "./trpc/context";
import { appRouter } from "./trpc/router";

export type RouteHandler = HTMLBundle | ((req: Request) => Response | Promise<Response>);

export type ServerOptions = {
  env: Env;
  pages: { player: RouteHandler; admin: RouteHandler };
  contentDir: string;
  mediaDir: string;
};

const IMMUTABLE = "public, max-age=31536000, immutable";

export async function createServer({ env, pages, contentDir, mediaDir }: ServerOptions) {
  mkdirSync(env.DATA_DIR, { recursive: true });
  const { sqlite, db } = openDatabase(join(env.DATA_DIR, "app.db"));
  await migrateAuth(sqlite, env);
  const auth = createAuth(sqlite, env);

  const repo = createQuizRepo(db);
  const seeded = seedMissing(repo, await loadSeedFiles(contentDir));
  if (seeded.length) console.log(`Добавлены викторины из сида: ${seeded.join(", ")}`);

  const engine = new GameEngine({ repo, store: createSessionStore(db) });
  const createContext = createContextFactory({ auth, engine, repo, devBypass: env.devBypass });
  const onError = ({ error, path }: { error: Error; path?: string }) => {
    if ((error as { code?: string }).code === "INTERNAL_SERVER_ERROR") {
      console.error(`tRPC ${path ?? "?"}:`, error);
    }
  };
  const trpcHttp = createBunHttpHandler({
    router: appRouter,
    endpoint: "/api/trpc",
    emitWsUpgrades: true,
    createContext: ({ req }) => createContext(req.headers),
    onError,
  });
  const websocket = createBunWSHandler({
    router: appRouter,
    createContext: ({ req }) => createContext(req.headers),
    onError,
  });

  const serveMedia = async (file: string) => {
    if (!MEDIA_FILE_RE.test(file)) return new Response("Not found", { status: 404 });
    const f = Bun.file(join(mediaDir, file));
    if (!(await f.exists())) return new Response("Not found", { status: 404 });
    return new Response(f, {
      headers: {
        "content-type": file.endsWith(".avif") ? "image/avif" : "image/webp",
        "cache-control": IMMUTABLE,
      },
    });
  };

  const devRoutes = env.devBypass
    ? {
        "/api/dev/host-login": () =>
          new Response(null, {
            status: 302,
            headers: {
              location: "/admin",
              "set-cookie": `${DEV_HOST_COOKIE}=1; Path=/; HttpOnly; SameSite=Lax`,
            },
          }),
      }
    : {};

  const server = Bun.serve({
    port: env.PORT,
    development: env.NODE_ENV !== "production" && { hmr: true, console: true },
    routes: {
      "/": pages.player,
      "/admin": pages.admin,
      "/admin/*": pages.admin,
      "/api/health": () => Response.json({ ok: true }),
      "/api/auth/*": (req) => auth.handler(req),
      "/media/:file": (req) => serveMedia(req.params.file),
      ...devRoutes,
    },
    fetch(req, srv) {
      return trpcHttp(req, srv) ?? new Response("Not found", { status: 404 });
    },
    websocket,
  });

  return {
    server,
    engine,
    close() {
      server.stop(true);
      sqlite.close();
    },
  };
}
