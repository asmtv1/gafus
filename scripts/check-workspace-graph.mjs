#!/usr/bin/env node
/** Detect new workspace dependency cycles and forbidden package -> application edges. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const baselinePath = path.join(root, "scripts/architecture-workspace-cycles.json");

const packages = new Map();
for (const category of ["apps", "packages"]) {
  const parent = path.join(root, category);
  for (const directory of fs.readdirSync(parent, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    const filename = path.join(parent, directory.name, "package.json");
    if (!fs.existsSync(filename)) continue;
    const manifest = JSON.parse(fs.readFileSync(filename, "utf8"));
    if (manifest.name) packages.set(manifest.name, { category, manifest });
  }
}

const edges = new Map();
for (const [name, { category, manifest }] of packages) {
  const dependencies = { ...manifest.dependencies, ...manifest.optionalDependencies };
  const linked = Object.keys(dependencies).filter(dep => packages.has(dep)).sort();
  if (category === "packages" && linked.some(dep => packages.get(dep).category === "apps")) {
    throw new Error(`Package ${name} depends on an app; reverse the dependency`);
  }
  edges.set(name, linked);
}

// Canonicalize each elementary cycle so the same cycle is counted only once.
const cycles = new Set();
function explore(start, current, stack, visited) {
  for (const next of edges.get(current) ?? []) {
    if (next === start) {
      const ring = stack;
      const rotations = ring.map((_, index) => [...ring.slice(index), ...ring.slice(0, index)].join(" -> "));
      cycles.add(rotations.sort()[0]);
    } else if (!visited.has(next) && stack.length < packages.size) {
      explore(start, next, [...stack, next], new Set([...visited, next]));
    }
  }
}
for (const name of packages.keys()) explore(name, name, [name], new Set([name]));

const found = [...cycles].sort();
if (process.argv.includes("--snapshot")) {
  if (fs.existsSync(baselinePath)) {
    throw new Error("Architecture graph baseline already exists; do not expand it.");
  }
  fs.writeFileSync(baselinePath, JSON.stringify(found, null, 2) + "\n");
  console.log(`Recorded ${found.length} existing workspace cycles`);
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) throw new Error("Missing workspace dependency cycle baseline");
const baseline = new Set(JSON.parse(fs.readFileSync(baselinePath, "utf8")));
const added = found.filter(cycle => !baseline.has(cycle));
if (added.length) {
  console.error("New workspace dependency cycles:", added.join("\n"));
  process.exit(1);
}
console.log(`Workspace graph PASS: ${packages.size} projects, ${found.length} existing cycles, 0 new`);
