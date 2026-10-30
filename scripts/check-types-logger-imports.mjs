#!/usr/bin/env node
/** Fail closed if runtime logger helpers are imported from the browser-safe @gafus/types root. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(process.argv[2] === "--project-root" ? process.argv[3] : path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
if (!root || !fs.existsSync(root)) {
  console.error("A valid project root is required");
  process.exit(2);
}

const sourceExt = /\.(?:[cm]?[jt]sx?)$/;
const topLevel = /^(?:apps|packages|scripts|infra)\//;
const generated = /(?:^|\/)(?:node_modules|dist|build|coverage|\.next|\.turbo|\.git)\//;
function sourceFiles() {
  try {
    return [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      cwd: root,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    }).toString().split("\0").filter(Boolean))];
  } catch {
    // Small isolated regression fixtures intentionally are not Git repositories.
    const result = [];
    const scan = (base, relative) => {
      if (!fs.existsSync(base)) return;
      for (const item of fs.readdirSync(base, { withFileTypes: true })) {
        const rel = relative ? `${relative}/${item.name}` : item.name;
        if (generated.test(`${rel}/`) || item.isSymbolicLink()) continue;
        if (item.isDirectory()) scan(path.join(base, item.name), rel);
        else if (item.isFile()) result.push(rel);
      }
    };
    for (const section of ["apps", "packages", "scripts", "infra"]) scan(path.join(root, section), section);
    return result;
  }
}

const forbidden = new Set(["createLogger", "silentLogger", "shouldLog"]);
const violations = [];
let inspected = 0;
let rootImports = 0;
for (const rel of sourceFiles()) {
  if (!topLevel.test(rel) || !sourceExt.test(rel) || /\.d\.[cm]?ts$/.test(rel) || generated.test(rel)) continue;
  const filename = path.join(root, rel);
  let source;
  try { source = fs.readFileSync(filename, "utf8"); } catch { continue; }
  inspected++;
  if (!source.includes("@gafus/types")) continue;
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const reject = (node, why) => {
    const pos = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
    violations.push(`${rel}:${pos.line + 1}:${pos.character + 1}: ${why}`);
  };
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "@gafus/types") {
      rootImports++;
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        if (clause && !clause.isTypeOnly) {
          if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
            for (const part of clause.namedBindings.elements) {
              if (!part.isTypeOnly && forbidden.has((part.propertyName ?? part.name).text)) {
                reject(part, `runtime ${part.getText(parsed)} must import from @gafus/types/logger`);
              }
            }
          } else if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
            reject(clause.namedBindings, "namespace runtime import from @gafus/types masks logger-helper access; use explicit named imports");
          }
        }
      } else if (!node.isTypeOnly) {
        if (!node.exportClause) reject(node, "wildcard runtime reexport of @gafus/types masks logger-helper access; use explicit named exports");
        else if (ts.isNamedExports(node.exportClause)) for (const part of node.exportClause.elements) {
          if (!part.isTypeOnly && forbidden.has((part.propertyName ?? part.name).text)) {
            reject(part, `runtime ${part.getText(parsed)} must reexport from @gafus/types/logger`);
          }
        }
      }
    }
    if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression) &&
      node.moduleReference.expression.text === "@gafus/types") {
      reject(node, "import-equals from root @gafus/types masks logger-helper access; use explicit server logger entrypoint");
    }
    if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "@gafus/types" &&
      ((ts.isIdentifier(node.expression) && node.expression.text === "require") || node.expression.kind === ts.SyntaxKind.ImportKeyword)) {
      reject(node, "dynamic root @gafus/types import cannot prove logger-helper migration; use explicit named imports");
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
}
if (violations.length) {
  console.error(`Types root runtime logger imports FAIL (${violations.length}):\n${violations.join("\n")}`);
  process.exit(1);
}
console.log(`Types root runtime logger imports PASS: ${inspected} source files, ${rootImports} root import/export declarations checked`);
