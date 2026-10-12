#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const legacyAdapters = [
  "reengagement", "statistics", "feed-server", "gallery-server",
  "auth", "mailer", "webpush",
];
// Explicit infrastructure seams only. These provider/framework adapters require
// direct persistence until their transport contracts are redesigned; no additional
// module can start importing the database without failing CI.
const permittedInfrastructure = new Set([
  "packages/auth/src/auth.ts",           // NextAuth PrismaAdapter
  "packages/mailer/src/resend.ts",       // provider send-attempt journal
  "packages/mailer/src/webhook.ts",      // verified provider event journal
  "packages/webpush/src/db.ts",          // legacy subscription adapter
  "packages/webpush/src/expoPush.ts",    // provider invalid-endpoint cleanup
  "packages/webpush/src/rustorePush.ts", // provider invalid-endpoint cleanup
]);
const observedExceptions = new Set();
const errors = [];
let checked = 0;

function walkDirectory(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name === "node_modules" || item.name === "dist") continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) { walkDirectory(full); continue; }
    if (!/\.(ts|tsx|js|jsx)$/.test(item.name) || /\.(test|spec)\./.test(item.name)) continue;
    checked++;
    const source = ts.createSourceFile(full, fs.readFileSync(full, "utf8"), ts.ScriptTarget.Latest, true);
    ts.forEachChild(source, function visit(node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
        && node.moduleSpecifier.text === "@gafus/prisma") {
        const clause = node.importClause;
        const typeOnly = clause?.isTypeOnly || (clause?.namedBindings
          && ts.isNamedImports(clause.namedBindings) &&
          clause.namedBindings.elements.every(item => item.isTypeOnly));
        if (!typeOnly) {
          const name = path.relative(root, full);
          if (permittedInfrastructure.has(name)) observedExceptions.add(name);
          else errors.push(name);
        }
      }
      if (ts.isCallExpression(node) && node.arguments.length === 1
        && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "@gafus/prisma"
        && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
        const name = path.relative(root, full);
        if (permittedInfrastructure.has(name)) observedExceptions.add(name);
        else errors.push(name);
      }
      ts.forEachChild(node, visit);
    });
  }
}
for (const name of legacyAdapters) walkDirectory(path.join(root, "packages", name, "src"));
for (const expected of permittedInfrastructure) {
  if (!observedExceptions.has(expected)) errors.push(`Expected infrastructure seam changed: ${expected}`);
}
if (errors.length) {
  console.error("Legacy domain adapter ORM boundary FAIL:\n" + errors.join("\n"));
  process.exit(1);
}
console.log(`Domain adapter ORM boundary PASS: ${legacyAdapters.join(", ")}; ${checked} source files; ${observedExceptions.size} fixed infrastructure exceptions, no new runtime Prisma`);
