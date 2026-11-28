#!/usr/bin/env node
/** Browser/server wire types must cross a public package boundary, never a
 * relative path into the monorepo's TS sources. Type-only subpaths must not
 * accidentally turn into runtime exports. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = process.argv[2] === "--project-root"
  ? path.resolve(process.argv[3])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "packages/types/package.json"), "utf8"));
const declarationOnly = new Set(Object.entries(manifest.exports ?? {})
  .filter(([, value]) => typeof value === "object" && value.types && !value.default && !value.import && !value.require)
  .map(([key]) => "@gafus/types" + key.slice(1)));
const violations = [];
let checked = 0;

function scan(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, {withFileTypes:true})) {
    const filename = path.join(dir,item.name);
    if (item.isSymbolicLink()) continue;
    if (item.isDirectory()) {
      if (!["node_modules","dist","build","coverage","test","tests","__tests__"].includes(item.name)) scan(filename);
      continue;
    }
    if (!/\.[cm]?tsx?$/.test(item.name) || /\.(?:test|spec|d)\.[cm]?tsx?$/.test(item.name)) continue;
    const source = fs.readFileSync(filename,"utf8");
    const sf = ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true);
    const reject = (node,why) => {
      const loc = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      violations.push(path.relative(root,filename) + ":" + (loc.line+1) + ": " + why);
    };
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const name = node.moduleSpecifier.text;
        if (name.startsWith(".") && path.resolve(dir,name).startsWith(path.join(root,"packages/types/src")+path.sep))
          reject(node,"use public @gafus/types exports instead of private source paths");
        if (declarationOnly.has(name)) {
          checked++;
          const clause = ts.isImportDeclaration(node) ? node.importClause : node;
          const allNamedTypes = ts.isImportDeclaration(node)
            ? clause?.namedBindings && ts.isNamedImports(clause.namedBindings) && !clause.name && clause.namedBindings.elements.every(part=>part.isTypeOnly)
            : node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.every(part=>part.isTypeOnly);
          if (!clause?.isTypeOnly && !allNamedTypes) reject(node,"declaration-only export requires type-only import/export: "+name);
        }
      }
      if (ts.isCallExpression(node) && node.arguments.length===1 && ts.isStringLiteral(node.arguments[0]) &&
          (node.expression.kind===ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text==="require"))) {
        const name=node.arguments[0].text;
        if (declarationOnly.has(name)) reject(node,"declaration-only export cannot be loaded at runtime: "+name);
        if (name.startsWith(".") && path.resolve(dir,name).startsWith(path.join(root,"packages/types/src")+path.sep))
          reject(node,"private source path loaded at runtime");
      }
      ts.forEachChild(node,visit);
    }
    visit(sf);
  }
}
for (const folder of ["apps/api/src","apps/trainer-panel/src","apps/mobile/src","apps/mobile/app","apps/web-vite/src","apps/admin-panel/src"]) scan(path.join(root,folder));
for (const name of declarationOnly) {
  const key = "."+name.slice("@gafus/types".length);
  const types = manifest.exports[key].types;
  const relative = types.replace(/^\.\/dist\//,"").replace(/\.d\.ts$/,".ts");
  if (!fs.existsSync(path.join(root,"packages/types/src",relative))) violations.push("missing declaration source for "+name);
}
if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode=1;
} else console.log("Wire contract imports PASS:", checked, "declaration-only imports; no private source paths");
