#!/usr/bin/env node
/**
 * Strict transitional Worker Prisma boundary.
 * Explicit legacy exceptions are isolated; any new runtime ORM import fails CI.
 * Type-only Prisma imports and *.test.ts are not runtime dependencies.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, "packages/worker/src");
const allowed = new Set([
  // No scheduled/interactive worker is allowed to access Prisma directly.
  // Only run explicitly on isolated test DBs; not runtime workers:
  "smart-experiment-report.ts",
  "smart-feed-sql-smoke.ts",
]);
const found = new Set();
const violations = [];

function scan(directory) {
  for (const file of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, file.name);
    if (file.isDirectory()) { scan(absolute); continue; }
    if (!/\.([cm]?ts|tsx|js|jsx)$/.test(file.name) || /\.test\.|\.spec\./.test(file.name)) continue;
    const relative = path.relative(source, absolute).replaceAll(path.sep, "/");
    const node = ts.createSourceFile(absolute, fs.readFileSync(absolute, "utf8"), ts.ScriptTarget.Latest, true);
    let runtimePrisma = false;
    function walk(expr) {
      if (ts.isImportDeclaration(expr) && ts.isStringLiteral(expr.moduleSpecifier)
        && expr.moduleSpecifier.text.startsWith("@gafus/prisma")) {
        const clause = expr.importClause;
        const onlyTypes = clause?.isTypeOnly ||
          (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
           && clause.namedBindings.elements.length > 0
           && clause.namedBindings.elements.every(item => item.isTypeOnly));
        if (!onlyTypes) runtimePrisma = true;
      }
      if (ts.isCallExpression(expr) && expr.arguments.length === 1
        && ts.isStringLiteral(expr.arguments[0])
        && expr.arguments[0].text.startsWith("@gafus/prisma")
        && ((ts.isIdentifier(expr.expression) && expr.expression.text === "require")
          || expr.expression.kind === ts.SyntaxKind.ImportKeyword)) runtimePrisma = true;
      ts.forEachChild(expr, walk);
    }
    walk(node);
    if (runtimePrisma) {
      found.add(relative);
      if (!allowed.has(relative)) violations.push(relative);
    }
  }
}
scan(source);
for (const exception of allowed) if (!found.has(exception)) violations.push(`stale exception: ${exception}`);
if (violations.length) {
  console.error("Worker Prisma boundary FAIL:\n" + violations.join("\n"));
  process.exit(1);
}
console.log(`Worker Prisma boundary PASS: ${found.size} documented exceptions, 0 new runtime imports`);
