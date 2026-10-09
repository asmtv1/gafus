import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../", import.meta.url));
await mkdir(new URL("../artifacts/", import.meta.url), { recursive: true });
for (const name of ["origin", "dispatch"]) {
 const output = fileURLToPath(new URL(`../artifacts/feed-${name}.zip`, import.meta.url));
 await rm(output, { force: true });
 execFileSync("zip", ["-q", "-X", output, "index.js", "package.json"], { cwd: `${cwd}dist/${name}` });
 console.log(`Feed ${name} artifact packaged.`);
}
