#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const base = path.join(root, "packages/types/dist");
const barrel = fs.readFileSync(path.join(base, "index.d.ts"), "utf8");
const declarations = fs.readFileSync(
  path.join(base, "contracts/usernameAvailability.d.ts"), "utf8",
);
const js = fs.readFileSync(path.join(base, "index.js"), "utf8");
const runtime = await import(pathToFileURL(path.join(base, "index.js")).href);
// A private export accidentally absent from declaration bundling makes every
// downstream consumer compile differently depending on aliases/dist paths.
for (const symbol of [
  "parseUsernameAvailabilityData",
  "parseUsernameAvailabilitySuccess",
  "isValidUsernameAvailabilityQuery",
]) {
  if (!barrel.includes(symbol) || !declarations.includes(symbol) ||
      !js.includes(symbol) || typeof runtime[symbol] !== "function") {
    throw Error("SHARED_TYPES_DIST_EXPORT_MISSING:" + symbol);
  }
}
console.log("TYPES_ARTIFACT_EXPORTS_PASS: JS + barrel DTS + implementation DTS");
