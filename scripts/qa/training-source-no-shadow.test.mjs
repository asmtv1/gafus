import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const trainingDir = path.join(root, "packages/core/src/services/training");

// Artifact files here used to hide the current TS module from Vite resolution.
// Build products belong in dist/ and must never become source-adjacent imports.
test("Core training TS is authoritative, without adjacent emitted JS/declarations", () => {
  for (const stem of ["index", "trainingService"]) {
    const tsFile = path.join(trainingDir, `${stem}.ts`);
    assert.ok(existsSync(tsFile), `required source missing: ${tsFile}`);
    for (const suffix of [".js", ".js.map", ".d.ts", ".d.ts.map"]) {
      assert.equal(existsSync(path.join(trainingDir, `${stem}${suffix}`)), false,
        `stale generated ${stem}${suffix} shadows the actual source`);
    }
  }
  // Core owns the public facade; the authoritatively compiled functions live
  // in the independent course-progress-server. Require BOTH paths so a stale
  // source-adjacent artifact or a missing server implementation fails closed.
  const source = readFileSync(path.join(trainingDir, "trainingService.ts"), "utf8");
  const serverDir = path.join(root, "packages/course-progress-server/src");
  const server = readFileSync(path.join(serverDir, "trainingService.ts"), "utf8");
  // Core exposes a fail-closed typed port; the only SQL factory is mounted
  // by the API composition root, never imported by Core.
  assert.doesNotMatch(source, /registerTrainingServicePort\(/);
  assert.match(source, /getCoreTrainingDependencies\(/);
  const composer = readFileSync(path.join(root,
    "apps/api/src/modules/training/composition/sql-training-instance.ts"), "utf8");
  assert.match(composer, /createTrainingService\(/);
  assert.match(composer, /@gafus\/course-progress-server\/training-service/);
  const apiApp = readFileSync(path.join(root, "apps/api/src/app.ts"), "utf8");
  assert.doesNotMatch(apiApp, /import "\.\/modules\/training\/composition\/install-training-service\.js"/);
  assert.match(apiApp, /sql-training-instance\.js/);
  assert.doesNotMatch(source, /@gafus\/course-progress-server\/training-service/);
  assert.doesNotMatch(source, /from ["']@gafus\/prisma["']/);
  for (const name of [
    "requireCourseStepOperationAccess",
    "applyStepAndDayTx",
    "syncUserCourseStatusFromDaysTx",
  ]) {
    assert.match(readFileSync(path.join(trainingDir, "trainingServiceContract.ts"), "utf8"), new RegExp(`\\b${name}\\b`));
    assert.match(server, new RegExp(`async\\s+function\\s+${name}\\s*\\(`));
  }
  for (const suffix of [".js", ".js.map", ".d.ts", ".d.ts.map"]) {
    assert.equal(existsSync(path.join(serverDir, `trainingService${suffix}`)), false,
      `source-adjacent training server emit shadows TS: ${suffix}`);
  }
});

test("Types TS sources are not shadowed by adjacent compiler output", () => {
  const typesDir = path.join(root, "packages/types/src");
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && /\.ts$/.test(file) && !/\.d\.ts$/.test(file)) {
        const stem = file.slice(0, -3);
        for (const suffix of [".js", ".js.map", ".d.ts", ".d.ts.map"]) {
          assert.equal(existsSync(stem + suffix), false, "source-adjacent compiler output: " + stem + suffix);
        }
      }
    }
  }
  visit(typesDir);
});
