#!/usr/bin/env node
/** Web may import only explicitly client-safe core entry points. */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const webRoot = path.join(root, "apps/web-vite/src");
const allowed = new Set();
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

visitDir(webRoot);
if (violations.length) {
  console.error("Web imported server-only or unreviewed core entry points:\n"+violations.join("\n"));
  process.exit(1);
}
console.log(`Web core boundary PASS: ${inspected} files, ${allowed.size} approved pure entry points`);
