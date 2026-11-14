import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "../..");
const script = resolve(root, "scripts/qa/architecture-final-regression.sh");
const web = resolve(root, "scripts/qa/web-vite-chunked-regression.mjs");
const shellSource = readFileSync(script, "utf8");
const webSource = readFileSync(web, "utf8");

test("outer full-regression run-id limit matches inner Web runner", () => {
  assert.ok(shellSource.includes("^[a-z][a-z0-9-]{0,32}$"));
  assert.ok(webSource.includes("^[a-z][a-z0-9-]{0,32}$"));
});

for (const id of ["a".repeat(34), "InvalidUppercase", "../outside"]) {
  test(`invalid run ID ${id} is rejected BEFORE any build or test`, () => {
    const result = spawnSync("bash", [script, id], {
      cwd: root,
      timeout: 5000,
      encoding: "utf8",
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Invalid run id/);
    assert.equal(result.stdout, "");
  });
}
