#!/usr/bin/env node
/**
 * Enforce zero runtime @gafus/prisma imports in apps/src.
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
const violations = Object.entries(current).flatMap(([file, imports]) =>
  imports.map(importText => `${file}: forbidden runtime Prisma import: ${importText}`),
);
if (violations.length) {
  console.error(violations.join("\n"));
  console.error("Application code must call core use cases instead of Prisma.");
  process.exit(1);
}
console.log("Architecture Prisma boundary: PASS (0 app runtime Prisma imports)");
