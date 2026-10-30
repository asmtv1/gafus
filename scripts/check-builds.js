#!/usr/bin/env node
const { existsSync } = require("node:fs");
const { resolve } = require("node:path");
const root = resolve(__dirname, "..");
const artifacts = [
  ["Web Vite", "apps/web-vite/dist/index.html"],
  ["Admin Vite", "apps/admin-panel/dist/index.html"],
  ["Trainer Vite", "apps/trainer-panel/src/trainer-vite/live/dist/index.html"],
  ["Hono API", "apps/api/dist/index.js"],
  ["Bull Board", "apps/bull-board/dist/bull-board.js"],
];
let missing = 0;
for (const [name, relative] of artifacts) {
  const ok = existsSync(resolve(root, relative));
  console.log(`${ok ? "PASS" : "MISSING"} ${name}: ${relative}`);
  if (!ok) missing++;
}
if (missing) process.exitCode = 1;
