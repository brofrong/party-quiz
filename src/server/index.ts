import { join } from "node:path";
import adminPage from "../client/admin/index.html";
import playerPage from "../client/player/index.html";
import { createServer } from "./app";
import { loadEnv } from "./env";

// Working directory = project root (dev) or /app (Docker); also valid for the bundled dist/index.js.
const root = process.cwd();
const env = loadEnv();
const { server } = await createServer({
  env,
  pages: { player: playerPage, admin: adminPage },
  contentDir: join(root, "content/quizzes"),
  mediaDir: join(root, "public/media"),
});
console.log(`🎉 Party Quiz: ${server.url}`);
