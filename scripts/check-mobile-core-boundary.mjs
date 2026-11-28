#!/usr/bin/env node
/** The mobile runtime must use core-client, never server Core. */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mobileRoots = ["apps/mobile/src", "apps/mobile/app"].map(dir => path.join(root, dir));
const serverCoreRoot = path.join(root, "packages/core");
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
    for (const specifier of findForbiddenCoreImports(source, full)) {
      violations.push(`${path.relative(root, full)}: ${specifier}`);
    }
  }
}

/** Also catch relative source imports, TypeScript import-equals/types and
 * dynamic imports with attributes. Server integration tests live outside
 * these two runtime roots and may keep their explicit dev dependency. */
export function findForbiddenCoreImports(source, full) {
  const result = [];
  const inspect = (specifier) => {
    if (!specifier) return;
    const isCore = specifier === "@gafus/core" || specifier.startsWith("@gafus/core/");
    const resolved = specifier.startsWith(".") ? path.resolve(path.dirname(full), specifier) : null;
    if (isCore || resolved === serverCoreRoot || resolved?.startsWith(serverCoreRoot + path.sep)) {
      result.push(specifier);
    }
  };
  const walk = node => {
    let literal;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) literal = node.moduleSpecifier;
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
      literal = node.moduleReference.expression;
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) literal = node.argument.literal;
    else if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (expr.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(expr) && expr.text === "require") ||
          (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression) &&
            expr.expression.text === "require" && expr.name.text === "resolve"))
        literal = node.arguments[0];
    }
    if (literal && ts.isStringLiteralLike(literal)) inspect(literal.text);
    ts.forEachChild(node, walk);
  };
  walk(source);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const dir of mobileRoots) visitDir(dir);
  if (violations.length) {
    console.error("Mobile imported server Core:\n" + violations.join("\n"));
    process.exit(1);
  }
  console.log(`Mobile core boundary PASS: ${inspected} files, 0 approved Core runtime entry points`);
}
