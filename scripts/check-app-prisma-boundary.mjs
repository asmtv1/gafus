#!/usr/bin/env node
/**
 * Fail closed on ANY new runtime @gafus/prisma import in apps/src.
 * 146 pre-existing imports are frozen in a reviewable baseline pending Core migration.
 * Type-only imports do not introduce a runtime dependency and are ignored.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const appsRoot = path.join(root, "apps");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);

function walk(dir, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name === "node_modules" || item.name === "dist" || item.name === ".next") continue;
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === "src" || dir !== appsRoot) walk(fullPath, found);
      else walk(path.join(fullPath, "src"), found);
    } else if (sourceExtensions.has(path.extname(item.name)) && fullPath.includes("/src/")) {
      found.push(fullPath);
    }
  }
  return found;
}

function scanFile(file) {
  const source = fs.readFileSync(file, "utf8");
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const matches = [];
  const isPrismaSpecifier = (value) => value === "@gafus/prisma" || value.startsWith("@gafus/prisma/");
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && isPrismaSpecifier(node.moduleSpecifier.text)) {
      const clause = node.importClause;
      const typeOnly = !!clause?.isTypeOnly || !!(clause?.namedBindings
        && ts.isNamedImports(clause.namedBindings)
        && !clause.name && clause.namedBindings.elements.every((item) => item.isTypeOnly));
      if (!typeOnly) matches.push(node.getText(ast).replace(/\s+/g, " ").trim());
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
      && isPrismaSpecifier(node.moduleSpecifier.text) && !node.isTypeOnly) {
      matches.push(node.getText(ast).replace(/\s+/g, " ").trim());
    } else if (ts.isCallExpression(node) && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
      && isPrismaSpecifier(node.arguments[0].text)
      && ((ts.isIdentifier(node.expression) && node.expression.text === "require")
        || node.expression.kind === ts.SyntaxKind.ImportKeyword)) {
      matches.push(node.getText(ast).replace(/\s+/g, " ").trim());
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return matches.sort();
}

function collect() {
  const current = {};
  for (const file of walk(appsRoot)) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const found = scanFile(file);
    if (found.length) current[relative] = found;
  }
  return Object.fromEntries(Object.entries(current).sort(([a],[b]) => a.localeCompare(b)));
}

const current = collect();
const baselinePath = path.join(root, "scripts/app-prisma-runtime-existing-baseline.json");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8")).imports;
if (!baseline || typeof baseline !== "object" || Array.isArray(baseline))
  throw Error("PRISMA_BASELINE_INVALID");
function unexpectedImports(source, frozen) {
const violations = [];
for (const [file, imports] of Object.entries(source)) {
  const approved = frozen[file];
  if (approved === undefined) {
    violations.push(...imports.map(item => `${file}: new forbidden runtime Prisma import: ${item}`));
    continue;
  }
  if (!Array.isArray(approved) || approved.some(item => typeof item !== "string") ||
      new Set(approved).size !== approved.length)
    throw Error("PRISMA_BASELINE_MALFORMED_" + file);
  const allowance = new Map();
  for (const item of approved) allowance.set(item, (allowance.get(item) ?? 0) + 1);
  for (const item of imports) {
    const remaining = allowance.get(item) ?? 0;
    if (remaining > 0) allowance.set(item, remaining - 1);
    else violations.push(`${file}: new forbidden runtime Prisma import: ${item}`);
  }
}
return violations;
}
const violations = unexpectedImports(current, baseline);
if (process.argv.includes("--self-test")) {
  const file = "apps/api/src/__runtime_prisma_test_canary__.ts";
  const code = "import { prisma } from '@gafus/prisma';";
  const newFile = unexpectedImports({ [file]: [code] }, baseline);
  if (newFile.length !== 1 || !newFile[0].includes("new forbidden"))
    throw Error("PRISMA_BOUNDARY_FAIL_OPEN_NEW_FILE");
  const existing = Object.entries(baseline)[0];
  if (!existing || unexpectedImports({ [existing[0]]: existing[1] }, baseline).length)
    throw Error("PRISMA_BOUNDARY_BASELINE_FALSE_POSITIVE");
  const extra = unexpectedImports({ [existing[0]]: [...existing[1], code] }, baseline);
  if (extra.length !== 1) throw Error("PRISMA_BOUNDARY_FAIL_OPEN_EXTRA_IMPORT");
  console.log("Prisma boundary regression: new files and added runtime imports BLOCKED");
  process.exit(0);
}
const frozenTotal = Object.values(baseline).reduce((n, values) => n + values.length, 0);
if (frozenTotal !== 146) throw Error("PRISMA_BASELINE_TOTAL_UNEXPECTED");
if (violations.length) {
  console.error(violations.join("\n"));
  console.error("New app Prisma access forbidden; migrate to Core instead. Existing imports are frozen and cannot grow.");
  process.exit(1);
}
console.log(`Prisma boundary: PASS (no NEW runtime imports, existing baseline ${frozenTotal}; migrate legacy imports to Core)`);
