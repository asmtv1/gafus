import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../", import.meta.url));
process.chdir(cwd);
await mkdir("dist", { recursive: true });
const result = await build({ entryPoints: ["src/server.ts"], outfile: "dist/server.js", bundle: true,
  platform: "node", target: "node22", format: "esm", external: ["sharp"], metafile: true,
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
});
const inputs = Object.entries(result.metafile.inputs).filter(([, data]) => data.bytes > 0).map(([name]) => name);
if (inputs.some(name => /prisma|core\/src|packages\/logger/.test(name))) throw new Error("FORBIDDEN_FEED_CLOUD_BUNDLE");
await writeFile("dist/metafile.json", JSON.stringify(result.metafile));
console.log("Feed worker bundled; no Prisma, core or application logger in cloud runtime.");

await mkdir("dist/origin", { recursive: true });
const origin = await build({ entryPoints: ["src/origin.ts"], outfile: "dist/origin/index.js", bundle: true,
  platform: "node", target: "node22", format: "cjs", minify: true, metafile: true });
const originInputs = Object.keys(origin.metafile.inputs);
if (originInputs.some(name => /prisma|core\/src|sharp|child_process|feed-cloud\/src\/index/.test(name))) throw new Error("HEAVY_FEED_ORIGIN_BUNDLE");
await writeFile("dist/origin/package.json", JSON.stringify({ type: "commonjs", private: true }));
console.log("Feed origin bundled separately without processors or DB.");
await mkdir("dist/dispatch", { recursive: true });
await build({ entryPoints: ["src/dispatch.ts"], outfile: "dist/dispatch/index.js", bundle: true,
  platform: "node", target: "node22", format: "cjs", minify: true });
await writeFile("dist/dispatch/package.json", JSON.stringify({ type: "commonjs", private: true }));
