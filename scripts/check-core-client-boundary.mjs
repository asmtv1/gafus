#!/usr/bin/env node
/** Browser entrypoints must remain safe through workspace re-exports, not just direct imports. */
import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectFlag = process.argv.indexOf("--project-root");
const root = projectFlag >= 0
  ? path.resolve(process.argv[projectFlag + 1])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = path.join(root, "packages/core-client/src");
const appRoots = ["apps/web-vite/src", "apps/mobile/app", "apps/mobile/src"]
  .map((directory) => path.join(root, directory));
const allowedClientExternals = new Set(["@gafus/types", "zod", "validator", "petrovich"]);
const forbiddenRuntimeWorkspaces = new Set([
  "@gafus/core", "@gafus/prisma", "@gafus/queues", "@gafus/logger", "@gafus/mailer",
]);
const forbiddenServerExternals = new Set([
  "@prisma/client", "prisma", "nodemailer", "bullmq", "ioredis", "pg", "sharp", "pino",
]);
const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));
const violations = new Set();
const modules = new Map();
const visited = new Set();
const workspaces = new Map();
let inspected = 0;

function relative(file) {
  return path.relative(root, file);
}
function sourceFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  const pending = [directory];
  while (pending.length) {
    for (const entry of fs.readdirSync(pending.pop(), { withFileTypes: true })) {
      const file = path.join(entry.parentPath ?? entry.path, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", "dist", "build", "coverage", "__tests__"].includes(entry.name)) pending.push(file);
      } else if (/\.[mc]?[jt]sx?$/.test(entry.name) &&
        !/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name) &&
        !/\.vitest\.config\.[cm]?[jt]s$/.test(entry.name) &&
        !file.endsWith(".d.ts")) result.push(file);
    }
  }
  return result;
}
function getImports(file) {
  if (modules.has(file)) return modules.get(file);
  inspected++;
  const code = fs.readFileSync(file, "utf8");
  const parsed = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true,
    /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports = [];
  function record(spec, typeOnly = false) {
    imports.push({ spec, typeOnly });
  }
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      let onlyTypes = node.isTypeOnly === true || node.importClause?.isTypeOnly === true;
      const bindings = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : node.exportClause;
      const hasDefault = ts.isImportDeclaration(node) && Boolean(node.importClause?.name);
      if (!onlyTypes && !hasDefault && bindings &&
        (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))) {
        onlyTypes = bindings.elements.length > 0 && bindings.elements.every((item) => item.isTypeOnly);
      }
      record(node.moduleSpecifier.text, onlyTypes);
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const argument = node.moduleReference.expression;
      record(argument && ts.isStringLiteral(argument) ? argument.text : "<nonliteral import>", node.isTypeOnly);
    }
    if (ts.isCallExpression(node)) {
      const dynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const requireCall = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (dynamic || requireCall) {
        const [argument] = node.arguments;
        record(node.arguments.length === 1 && argument && ts.isStringLiteral(argument)
          ? argument.text : "<nonliteral import>");
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  modules.set(file, imports);
  return imports;
}
function workspace(spec) {
  for (const [name, info] of workspaces) {
    if (spec === name || spec.startsWith(name + "/")) return { name, ...info };
  }
  return null;
}
function resolveSource(candidate) {
  const withoutExtension = candidate.replace(/\.(?:[cm]?[jt]sx?)$/, "");
  // Generated .js files sometimes coexist with live .ts sources; always inspect the source.
  for (const item of [`${withoutExtension}.ts`, `${withoutExtension}.tsx`, candidate,
    `${withoutExtension}.js`, `${candidate}/index.ts`, `${candidate}/index.tsx`]) {
    if (fs.existsSync(item) && fs.statSync(item).isFile() && !item.endsWith(".d.ts")) return item;
  }
  return null;
}
function workspaceSource(spec) {
  const pkg = workspace(spec);
  if (!pkg) return null;
  const subpath = spec.slice(pkg.name.length).replace(/^\//, "");
  const entry = pkg.manifest.exports?.[subpath ? `./${subpath}` : "."];
  let target = (typeof entry === "string" ? entry : entry?.default) ||
    (subpath ? `dist/${subpath}.js` : pkg.manifest.main || "dist/index.js");
  target = target.replace(/^\.\//, "").replace(/^dist\//, "src/");
  return { pkg, file: resolveSource(path.join(pkg.directory, target)) ||
    resolveSource(path.join(pkg.directory, "src", subpath || "index")) };
}
function isForbidden(spec) {
  const bare = spec.replace(/^node:/, "");
  if (builtins.has(bare)) return true;
  if (spec.startsWith("node:")) return true;
  if ([...forbiddenServerExternals].some((name) => spec === name || spec.startsWith(name + "/")))
    return true;
  if (!spec.startsWith("@gafus/")) return false;
  const name = spec.split("/").slice(0, 2).join("/");
  return forbiddenRuntimeWorkspaces.has(name) || name.endsWith("-server");
}
function addViolation(trace, detail) {
  violations.add(`${trace}: ${detail}`);
}
function visitRuntime(file, trace, isClient = false) {
  if (visited.has(file)) return;
  visited.add(file);
  for (const { spec, typeOnly } of getImports(file)) {
    const via = `${trace} -> ${relative(file)} (${spec})`;
    if (spec === "<nonliteral import>") {
      addViolation(via, "nonliteral runtime import/require cannot be verified");
      continue;
    }
    // @gafus/types subpath entries are still resolved and transitively scanned below.
    if (isClient && !spec.startsWith(".") &&
      !allowedClientExternals.has(spec) && workspace(spec)?.name !== "@gafus/types") {
      addViolation(via, "unsupported core-client dependency (even type-only)");
    }
    if (spec.startsWith(".")) {
      const candidate = path.resolve(path.dirname(file), spec);
      if (isClient && !candidate.startsWith(clientRoot + path.sep)) {
        addViolation(via, "relative import escapes core-client");
        continue;
      }
      if (!typeOnly) {
        const local = resolveSource(candidate);
        if (local) visitRuntime(local, via, local.startsWith(clientRoot + path.sep));
      }
      continue;
    }
    if (typeOnly) continue;
    if (isForbidden(spec)) {
      addViolation(via, "server/Node dependency reachable at runtime");
      continue;
    }
    if (spec.startsWith("@gafus/")) {
      const resolved = workspaceSource(spec);
      if (!resolved) {
        addViolation(via, "unresolved workspace package");
      } else if (!resolved.file) {
        addViolation(via, "workspace export has no inspectable source");
      } else {
        visitRuntime(resolved.file, via, resolved.file.startsWith(clientRoot + path.sep));
      }
    }
  }
}

for (const directory of ["packages", "apps"]) {
  const parent = path.join(root, directory);
  if (!fs.existsSync(parent)) continue;
  for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageDirectory = path.join(parent, entry.name);
    const manifestFile = path.join(packageDirectory, "package.json");
    if (fs.existsSync(manifestFile)) {
      const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
      if (manifest.name) workspaces.set(manifest.name, { manifest, directory: packageDirectory });
    }
  }
}
const clientManifest = workspaces.get("@gafus/core-client")?.manifest;
if (!clientManifest) addViolation("core-client", "missing package manifest");
for (const name of Object.keys(clientManifest?.dependencies || {})) {
  if (!allowedClientExternals.has(name)) addViolation("core-client/package.json", `forbidden dependency ${name}`);
}
for (const [name, entry] of Object.entries(clientManifest?.exports || {})) {
  if (!entry.types || !entry.default ||
    !resolveSource(path.join(root, "packages/core-client", entry.default.replace(/^\.\/dist\//, "src/")))) {
    addViolation("core-client/package.json", `export ${name} lacks a valid source or explicit types/default`);
  }
}
for (const file of sourceFiles(clientRoot)) visitRuntime(file, relative(file), true);
for (const directory of appRoots) {
  const manifest = directory.includes("web-vite")
    ? workspaces.get("@gafus/web-vite")?.manifest : workspaces.get("@gafus/mobile")?.manifest;
  for (const file of sourceFiles(directory)) {
    // Direct app source is inspected even when not imported by a known entrypoint.
    for (const { spec, typeOnly } of getImports(file)) {
      if (typeOnly) continue;
      if (isForbidden(spec)) addViolation(relative(file), `server/Node runtime dependency ${spec}`);
      const pkg = workspace(spec);
      if (pkg && !manifest?.dependencies?.[pkg.name]) {
        addViolation(relative(file), `workspace runtime dependency ${pkg.name} must be in dependencies`);
      }
      const resolved = workspaceSource(spec);
      if (resolved?.file && !isForbidden(spec)) visitRuntime(resolved.file, relative(file));
    }
  }
}
if (violations.size) {
  const problems = [...violations];
  console.error(`Core client/server boundary FAIL (${problems.length}):\n` +
    problems.slice(0, 40).join("\n") +
    (problems.length > 40 ? `\n... and ${problems.length - 40} more` : ""));
  process.exit(1);
}
console.log(`Core client/server boundary PASS: ${inspected} inspected modules, transitive workspace graph checked`);
