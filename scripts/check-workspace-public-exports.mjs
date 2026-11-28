#!/usr/bin/env node
/** Source audit for workspace package boundaries. --built adds a check of
 * actual exported artifacts after a clean build without executing server modules. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const rootArg = process.argv.indexOf("--project-root");
const root = rootArg < 0 ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") : path.resolve(process.argv[rootArg + 1]);
const built = process.argv.includes("--built");
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const exists = file => fs.existsSync(file);
const dirs = ["apps", "packages"].flatMap(category =>
  fs.readdirSync(path.join(root, category), { withFileTypes: true })
    .filter(d => d.isDirectory() && exists(path.join(root, category, d.name, "package.json")))
    .map(d => category + "/" + d.name));
const owners = new Map(dirs.map(dir => {
  const manifest = read(path.join(root, dir, "package.json"));
  return [manifest.name, { dir, manifest }];
}));
const manifestsByDir = new Map([...owners.values()].map(({dir,manifest}) => [dir,manifest]));
const qaHost = read(path.join(root, "package.json"));
const errors = [];
let exportsChecked = 0, importCount = 0, qaHostImports = 0;
const usedExports = new Set();
const qaEntries = new Set([
  "apps/admin-panel/AG4VetOwnerRealHonoReadonlyProducer20261018.mjs",
  "apps/admin-panel/AG4VetWebInProcessReadBridge20261018.mjs",
  "apps/api/src/a2-observability-private-server.ts",
  "apps/api/src/modules/reminders/composition/create-receipt-review.ts",
  "apps/api/src/routes/v1/g1-reminder-create-lookup.review.ts",
  "apps/api/src/routes/v1/g1-reminders-v2-unmounted.review.ts",
  "apps/feed-cloud/src/chat2-new-org-s3-acceptance.mts",
  "apps/feed-cloud/src/chat2-s3-acceptance.ts",
  "apps/gallery-cloud/src/gallery-v2-browser-worker-once.ts",
  "packages/logger/test-database-logging.js",
]);
function isQa(file) {
  return qaEntries.has(file) || /(?:\.(?:test|spec)\.|\/(?:test|tests|__tests__|__fixtures__|tools)\/)/.test(file);
}
function packageOwner(file) {
  return dirs.find(dir => file.startsWith(dir + "/"));
}
function exportValues(value, condition = "default") {
  if (typeof value === "string") return [{ condition, target: value }];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, part]) => exportValues(part, key));
}
function sourceExists(dir, target) {
  if (!target.startsWith("./dist/")) return exists(path.resolve(root, dir, target));
  const stem = target.slice("./dist/".length).replace(/(?:\.d\.ts|\.mjs|\.cjs|\.js)$/, "");
  const candidates = new Set([stem, stem.replace(/^[^/]+\/src\//, ""), stem.replace(/^src\//, "")]);
  for (const s of candidates) for (const prefix of ["src/", ""]) {
    for (const suffix of [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".d.ts", "/index.ts", "/index.tsx"]) {
      if (exists(path.join(root, dir, prefix + s + suffix))) return true;
    }
  }
  return false;
}
for (const [name, {dir, manifest}] of owners) {
  for (const [key, value] of Object.entries(manifest.exports ?? {})) {
    exportsChecked++;
    const values = exportValues(value);
    if (!values.length || key.includes("*")) {
      errors.push(name + " " + key + ": unsupported or empty export; audit explicitly");
      continue;
    }
    for (const {condition, target} of values) {
      const absolute = path.resolve(root, dir, target);
      if (!target.startsWith("./") || !absolute.startsWith(path.join(root, dir) + path.sep)) {
        errors.push(name + " " + key + ": export escapes package");
        continue;
      }
      if (!sourceExists(dir, target)) errors.push(name + " " + key + " " + condition + ": no source for " + target);
      if (built && !exists(absolute)) errors.push(name + " " + key + " " + condition + ": missing built artifact " + target);
    }
  }
}
const files = [...new Set(execFileSync("git", ["ls-files", "-c", "-o", "--exclude-standard", "-z"],
  {cwd:root, maxBuffer:32*1024*1024}).toString().split("\0"))];
for (const file of files) {
  if (!/^(apps|packages)\/[^/]+\/tsconfig[^/]*\.json$/.test(file) || !exists(path.join(root,file))) continue;
  const parsed = ts.parseConfigFileTextToJson(file,fs.readFileSync(path.join(root,file),"utf8"));
  if (parsed.error) {
    errors.push(file + ": invalid tsconfig");
    continue;
  }
  for (const key of Object.keys(parsed.config?.compilerOptions?.paths ?? {})) {
    const match = key.match(/^(@gafus\/[^/]+)(\/.*)$/);
    if (!match || key.includes("*")) continue;
    const exp = owners.get(match[1])?.manifest.exports;
    if (exp && !Object.hasOwn(exp,"."+match[2])) errors.push(file + ": stale public alias " + key);
  }
}
function checkSpecifier(spec, file, owner, typeOnly, loc) {
  const qa = isQa(file);
  if (spec.startsWith(".")) {
    const rel = path.relative(root, path.resolve(root, path.dirname(file), spec)).split(path.sep).join("/");
    const target = packageOwner(rel);
    if (target && target !== owner && !qa) errors.push(loc + ": private cross-workspace source path " + spec);
    return;
  }
  const match = spec.match(/^(@gafus\/[^/]+)(\/.*)?$/);
  if (!match) return;
  const [, name, sub] = match;
  const pkg = owners.get(name);
  if (!pkg) {
    errors.push(loc + ": unknown workspace " + name);
    return;
  }
  importCount++;
  const key = sub ? "." + sub : ".";
  const exp = pkg.manifest.exports;
  if (exp && !Object.hasOwn(exp, key)) errors.push(loc + ": missing public export " + spec);
  if (!exp && sub) errors.push(loc + ": deep import without an explicit public export " + spec);
  if (exp && Object.hasOwn(exp, key)) {
    usedExports.add(spec);
    const values = exportValues(exp[key]);
    if (values.every(v => v.condition === "types") && !typeOnly)
      errors.push(loc + ": declaration-only export loaded at runtime: " + spec);
  }
  const manifest = manifestsByDir.get(owner);
  if (manifest.name === name) return;
  if (manifest.dependencies?.[name] || manifest.optionalDependencies?.[name] || manifest.peerDependencies?.[name]) return;
  if (qa && manifest.devDependencies?.[name]) return;
  if (qa && (qaHost.devDependencies?.[name] || qaHost.dependencies?.[name])) {
    qaHostImports++;
    return;
  }
  if (typeOnly && manifest.devDependencies?.[name]) return;
  errors.push(loc + ": missing declared " + (qa ? "QA" : "workspace") + " dependency " + name);
}
for (const file of files) {
  const owner = packageOwner(file);
  if (!owner || !/\.[cm]?[jt]sx?$/.test(file) || /\/(?:dist|node_modules|build|\.types-build-[^/]+)\//.test(file)) continue;
  const absolute = path.join(root, file);
  if (!exists(absolute)) continue;
  const sf = ts.createSourceFile(file, fs.readFileSync(absolute, "utf8"), ts.ScriptTarget.Latest, true);
  function check(node, typeOnly) {
    if (!node || !ts.isStringLiteralLike(node)) return;
    const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    checkSpecifier(node.text, file, owner, typeOnly, file + ":" + (pos.line + 1));
  }
  function visit(n) {
    if (ts.isImportDeclaration(n)) {
      const clause = n.importClause;
      check(n.moduleSpecifier, !!(clause?.isTypeOnly || (!clause?.name && clause?.namedBindings &&
        ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length &&
        clause.namedBindings.elements.every(e => e.isTypeOnly))));
    } else if (ts.isExportDeclaration(n)) {
      check(n.moduleSpecifier, n.isTypeOnly || !!(n.exportClause && ts.isNamedExports(n.exportClause) &&
        n.exportClause.elements.length && n.exportClause.elements.every(e => e.isTypeOnly)));
    } else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword ||
        ts.isIdentifier(n.expression) && n.expression.text === "require")) {
      check(n.arguments[0], false);
    } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument)) {
      check(n.argument.literal, true);
    } else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) {
      check(n.moduleReference.expression, n.isTypeOnly);
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Workspace public exports PASS:", owners.size, "packages,", exportsChecked,
    "exports,", importCount, "import references,", usedExports.size, "used public subpaths,",
    qaHostImports, "explicit root QA imports" + (built ? ", built artifacts verified" : ""));
}
