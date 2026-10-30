// Fail-closed AG2 local Web startup guard against stale COURSE030 Core JS.
// This does NOT certify any already-running Hono's loaded modules.
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const FILES = [
  "packages/core/package.json",
  "packages/core/dist/core/src/services/course/index.js",
  "packages/core/dist/core/src/services/course/courseService.js",
];
function assertion(ok, label) {
  if (!ok) throw new Error("LOCAL_WEB_PRIVACY_DENIED:" + label);
}
export function checkPublishedCoursePrivacy({ artifact, index, pkg }) {
  assertion(typeof artifact === "string" && typeof index === "string", "missing_artifact");
  assertion(!/\bfavoritedBy\s*:\s*true\b/.test(artifact), "unscoped_favorite_query");
  assertion(
    /\bfavoritedBy\s*:\s*\{\s*where\s*:\s*\{\s*userId\s*:\s*userId\s*\?\?\s*["']{2}\s*\}\s*,\s*select\s*:\s*\{\s*userId\s*:\s*true\s*\}/m.test(artifact),
    "missing_owner_scoped_favorite_select",
  );
  assertion(
    /\bfavoritedBy\s*:\s*course\.favoritedBy\.filter\s*\(\s*\(\s*member\s*\)\s*=>\s*!!userId\s*&&\s*member\.userId\s*===\s*userId\s*\)/m.test(artifact),
    "missing_defensive_favorite_filter",
  );
  assertion(
    /\bisFavorite\s*:\s*favoriteCourseIds\.has\s*\(\s*course\.id\s*\)/.test(artifact),
    "lost_isFavorite",
  );
  assertion(
    /export\s+\*\s+from\s+["']\.\/courseService\.js["']/.test(index),
    "missing_course_index_export",
  );
  assertion(
    pkg && pkg.exports?.["./services/course"]?.default ===
      "./dist/core/src/services/course/index.js",
    "unexpected_published_package_entry",
  );
  return true;
}
export function validateActualArtifact() {
  const root = execFileSync("/usr/bin/git", [
    "-C", ROOT, "rev-parse", "--show-toplevel",
  ], { encoding: "utf8" }).trim();
  const branch = execFileSync("/usr/bin/git", [
    "-C", ROOT, "branch", "--show-current",
  ], { encoding: "utf8" }).trim();
  assertion(root === ROOT && process.cwd() === ROOT, "unexpected_project_root");
  assertion(branch === "vite", "unexpected_branch");
  for (const relative of [
    ".", "packages", "packages/core", "packages/core/dist",
    "packages/core/dist/core", "packages/core/dist/core/src",
    "packages/core/dist/core/src/services",
    "packages/core/dist/core/src/services/course", ...FILES,
  ]) {
    assertion(!lstatSync(path.join(ROOT, relative)).isSymbolicLink(), "symlink_or_path");
  }
  const [pkg, index, artifact] = FILES.map(rel =>
    readFileSync(path.join(ROOT, rel), "utf8"));
  return checkPublishedCoursePrivacy({ artifact, index, pkg: JSON.parse(pkg) });
}
if (process.argv[1] && path.resolve(process.argv[1]) ===
  path.resolve(path.join(ROOT, "scripts/refactor/ag2-local-web-core-privacy-guard.mjs"))) {
  try {
    validateActualArtifact();
    process.stdout.write("LOCAL_WEB_CORE_PRIVACY_ARTIFACT_PREFLIGHT_PASS\n");
  } catch (error) {
    process.stderr.write(
      String(error instanceof Error ? error.message : "LOCAL_WEB_PRIVACY_DENIED") + "\n");
    process.exitCode = 24;
  }
}
