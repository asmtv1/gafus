#!/usr/bin/env node
/** Statically traverse Metro's iOS-preferred local runtime imports; fail on YooKassa checkout. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { checkoutComponent, paymentProfile } from "./ota-payment-profile.mjs";
const checkout = checkoutComponent(paymentProfile());
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = process.argv.find((arg) => arg.startsWith("--entry="))?.slice(8) ??
  path.join(root, "src/features/app-subscription/components/AppSubscriptionPaywall.ios.tsx");
const prohibited = [
  /\/yookassaAppSubscriptionPurchase\./i,
  /\/appSubscriptionApi\.(tsx?|jsx?)$/i,
  /\/promoCodePresentation\./i,
  /\/appSubscriptionPresentation\./i,
  /\/yookassa-payments\//i,
];
const extensions = [".ios.tsx", ".ios.ts", ".native.tsx", ".native.ts", ".tsx", ".ts", ".jsx", ".js", ".json"];
const visited = new Set();
const violations = [];

function resolve(from, name) {
  const stem = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) :
    name.startsWith(".") ? path.resolve(path.dirname(from), name) : null;
  if (!stem) return null;
  if (checkout === "InternalCardCheckout" &&
      from === path.join(root, "src/features/app-subscription/components/AppSubscriptionPaywall.ios.tsx") &&
      name === "./OptionalCardCheckout") return path.join(path.dirname(from), `${checkout}.tsx`);
  const candidates = [stem, ...extensions.map((ext) => stem+ext),
    ...extensions.map((ext) => path.join(stem, "index"+ext))];
  return candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile()) ?? null;
}
function walk(file) {
  const resolved = path.resolve(file);
  if (visited.has(resolved)) return;
  visited.add(resolved);
  if (prohibited.some((rule) => rule.test(resolved))) {
    violations.push(resolved);
    return;
  }
  if (!/\.[jt]sx?$/.test(resolved)) return;
  const code = fs.readFileSync(resolved,"utf8");
  const tree = ts.createSourceFile(resolved, code, ts.ScriptTarget.Latest, true,
    resolved.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports = [];
  function visit(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier &&
      !node.importClause?.isTypeOnly) {
      const names = node.importClause?.namedBindings;
      const importOnlyTypes = names && ts.isNamedImports(names) && names.elements.length > 0 &&
        names.elements.every((element) => element.isTypeOnly) && !node.importClause?.name;
      if (!importOnlyTypes) imports.push(node.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly)
      imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      if (node.arguments.length !== 1 || !ts.isStringLiteralLike(node.arguments[0]))
        violations.push(`${resolved}: nonliteral dynamic runtime dependency`);
      else imports.push(node.arguments[0].text);
    }
    ts.forEachChild(node,visit);
  }
  visit(tree);
  for (const name of imports) {
    if (/yookassaAppSubscriptionPurchase|yookassa-payments|appSubscriptionApi($|\.)/.test(name))
      violations.push(`${resolved} -> ${name}`);
    const target = resolve(resolved,name);
    if (target) walk(target);
  }
}
walk(entry);
const containsCard=[...visited].some(file=>file.endsWith("/InternalCardCheckout.tsx"));
if(containsCard!==(checkout === "InternalCardCheckout")) violations.push("Checkout content differs from the verified distribution profile");
if (violations.length) {
  process.stderr.write(`iOS payment graph has forbidden modules:\n${violations.join("\n")}\n`);
  process.exitCode = 1;
} else {
  console.log(`iOS payment graph PASS: ${visited.size} local runtime modules, profile verified.`);
}
