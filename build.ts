/**
 * Production build: server + both HTML entrypoints (with Tailwind) bundled into ./dist,
 * plus the runtime files the server reads (migrations, seed content, media).
 * Run from dist/: Bun resolves bundled frontend chunks relative to the working directory.
 */
import { cp, rm } from "node:fs/promises";
import tailwind from "bun-plugin-tailwind";

await rm("dist", { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: ["src/server/index.ts"],
  outdir: "dist",
  root: ".",
  publicPath: "/",
  target: "bun",
  minify: true,
  sourcemap: "linked",
  plugins: [tailwind],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
for (const dir of ["drizzle", "content", "public"]) {
  await cp(dir, `dist/${dir}`, { recursive: true });
}
for (const o of result.outputs) {
  if (!o.path.endsWith(".map")) {
    console.log(`${o.path.replace(`${process.cwd()}/`, "")}  ${(o.size / 1024).toFixed(0)} KB`);
  }
}
