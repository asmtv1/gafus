/** Reject reintroduced side-effect installers, including module imports in a router. */
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const remaining = new Set([
].map(path => "apps/api/src/modules/" + path));

/** Return the runtime installer dependencies and violations for a source file. */
export function inspectInstallerImports(file, source) {
  const active = new Set();
  const violations = [];
  for (const { fileName } of ts.preProcessFile(source, true, true).importedFiles) {
    if (!/(?:^|\/)install-[^/]+$/.test(fileName)) continue;
    const target = relative(root, resolve(root, dirname(file), fileName)).replace(/\.[cm]?[jt]s$/, "");
    if (file !== "apps/api/src/app.ts" || !remaining.has(target)) {
      violations.push(file + " -> " + fileName);
    }
    active.add(target);
  }
  return { active, violations };
}

export function checkApiCompositionInstalls() {
  const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z", "--", "apps/api/src"],
    { cwd: root, encoding: "utf8" }).split("\0");
  const active = new Set();
  const violations = [];
  for (const file of files) {
    if (!/\.[cm]?[jt]sx?$/.test(file) || /\.(test|spec)\./.test(file)) continue;
    let source;
    try { source = readFileSync(resolve(root, file), "utf8"); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    const result = inspectInstallerImports(file, source);
    for (const target of result.active) active.add(target);
    violations.push(...result.violations);
  }
  if (violations.length) throw Error("NEW_API_GLOBAL_REGISTRATIONS_BLOCKED:\n" + violations.join("\n"));
  const stale = [...remaining].filter(path => !active.has(path));
  if (stale.length) throw Error("Remove retired installers from the allowlist:\n" + stale.join("\n"));
  if (process.argv.includes("--require-zero") && active.size) throw Error("API_EXPLICIT_DI_REQUIRED: " + active.size);
  console.log(`API_COMPOSITION_RATCHET_PASS ${active.size}/34 legacy installers remain`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkApiCompositionInstalls();
}
