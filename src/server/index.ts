import { join } from "node:path";
import adminPage from "../client/admin/index.html";
import playerPage from "../client/player/index.html";
import { createServer } from "./app";
import { loadEnv } from "./env";

const root = join(import.meta.dir, "../..");
const env = loadEnv();
const { server } = await createServer({
  env,
  pages: { player: playerPage, admin: adminPage },
  contentDir: join(root, "content/quizzes"),
  mediaDir: join(root, "public/media"),
});
console.log(`🎉 Party Quiz: ${server.url}`);
