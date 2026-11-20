#!/usr/bin/env node
/**
 * Ratchet the remaining Core -> server adapter compatibility facades.
 * These are NOT accepted as clean Domain/Application dependencies. Existing
 * calls are transitional; new ones fail CI until orchestration moves outward.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(projectRoot, "docs/audit/core-server-facade-baseline.json");
const excluded = new Set(["node_modules", "dist", "build", "coverage", ".turbo"]);
const sourcePattern = /\.[cm]?tsx?$/;
const testPattern = /\.(?:test|spec|integration|contract|real-pg)\.[cm]?tsx?$/;

function* sourceFiles(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name.startsWith(".")) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (entry.isFile() && sourcePattern.test(full) && !testPattern.test(full)) yield full;
  }
}

export function inventory(root = projectRoot) {
  const found = [];
  const base = path.join(root, "packages/core/src");
  for (const filename of sourceFiles(base)) {
    const relative = path.relative(root, filename).split(path.sep).join("/");
    const source = fs.readFileSync(filename, "utf8");
    // Walk the real AST: preProcessFile misses require() and some import() forms.
    // An expression-based import in Core cannot be proved free of server adapters,
    // so reject it rather than letting it bypass the shrinking ratchet.
    const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true,
      filename.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const accept = (literal) => {
      if (!literal) return;
      if (ts.isStringLiteral(literal) || ts.isNoSubstitutionTemplateLiteral(literal)) {
        const spec = literal.text;
        if (/^@gafus\/[a-z0-9-]+-server(?:\/|$)/.test(spec))
          found.push({ file: relative, import: spec });
      } else {
        found.push({ file: relative, import: "<computed-module-specifier>" });
      }
    };
    function walk(node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        accept(node.moduleSpecifier);
      } else if (ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)) {
        accept(node.moduleReference.expression);
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        accept(node.argument.literal);
      } else if (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          ts.isIdentifier(node.expression) && node.expression.text === "require")) {
        accept(node.arguments[0]);
      }
      ts.forEachChild(node, walk);
    }
    walk(ast);
  }
  return found.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
const signature = ({file, import: spec}) => JSON.stringify([file, spec]);
export function compare(current, previous) {
  const counts = (records) => {
    const map = new Map();
    for (const record of records) map.set(signature(record), (map.get(signature(record)) ?? 0) + 1);
    return map;
  };
  const actual = counts(current);
  const known = counts(previous);
  const added = current.filter(row => {
    const key = signature(row);
    const remaining = actual.get(key) ?? 0;
    const accepted = known.get(key) ?? 0;
    if (remaining <= accepted) return false;
    actual.set(key, remaining - 1);
    return true;
  });
  const removed = [...known].reduce((sum, [key, n]) =>
    sum + Math.max(0, n - (current.filter(row => signature(row) === key).length)), 0);
  const domainViolations = current.filter(row =>
    /\/src\/(?:domain|application)\//.test(row.file));
  return { added, removed, domainViolations };
}

// A resolved exception must disappear in the same change as its last caller.
// Otherwise this ratchet silently permits re-introducing a removed dependency.
export function check(current, previous) {
  const diff = compare(current, previous);
  return { ...diff, ok: !diff.added.length && !diff.removed && !diff.domainViolations.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const current = inventory();
  if (process.argv.includes("--write-baseline")) {
    if (process.env.ALLOW_CORE_SERVER_BASELINE_UPDATE !== "1")
      throw Error("Core server facade baseline update requires explicit review");
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify({
      version: 1,
      note: "Transitional compatibility facades; not pure Core Domain/Application.",
      imports: current,
    }, null, 2) + "\n");
    console.log("Frozen Core server-adapter baseline:", current.length);
  } else {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    const diff = check(current, baseline.imports);
    console.log("Core server-adapter facades:", current.length,
      "remaining,", diff.removed, "resolved,", diff.added.length, "new");
    if (!diff.ok) {
      console.error(JSON.stringify({
        staleExceptions: diff.removed,
        new: diff.added,
        forbiddenDomainImports: diff.domainViolations,
      }, null, 2));
      process.exitCode = 1;
    }
  }
}
