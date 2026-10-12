#!/usr/bin/env node
/** Mobile may import only explicitly client-safe core entry points. */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mobileRoot = path.join(root, "apps/mobile/src");
const allowed = new Set([
  "@gafus/core/utils",
  "@gafus/core/utils/training",
  "@gafus/core/validation/pet",
  "@gafus/core/services/feed/publication-client",
  // Pure fetch/URL-only CDN outage policy shared with Web; no server dependencies.
  "@gafus/core/services/mediaDelivery",
  "@gafus/core/services/auth/vkAuthConstants",
]);
const violations = [];
let inspected = 0;

function visitDir(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      visitDir(full);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(item.name)) continue;
    inspected++;
    const source = ts.createSourceFile(full, fs.readFileSync(full, "utf8"),
      ts.ScriptTarget.Latest, true, item.name.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function walk(node) {
      let specifier;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          specifier = node.moduleSpecifier.text;
        }
      }
      if (ts.isCallExpression(node) && node.arguments.length === 1
          && ts.isStringLiteral(node.arguments[0])
          && ((ts.isIdentifier(node.expression) && node.expression.text === "require")
            || node.expression.kind === ts.SyntaxKind.ImportKeyword)) {
        specifier = node.arguments[0].text;
      }
      if (specifier && (specifier === "@gafus/core" || specifier.startsWith("@gafus/core/"))
          && !allowed.has(specifier)) {
        violations.push(`${path.relative(root, full)}: ${specifier}`);
      }
      ts.forEachChild(node, walk);
    }
    walk(source);
  }
}

visitDir(mobileRoot);
if (violations.length) {
  console.error("Mobile imported server-only or unreviewed core entry points:\n"+violations.join("\n"));
  process.exit(1);
}
console.log(`Mobile core boundary PASS: ${inspected} files, ${allowed.size} approved pure entry points`);
