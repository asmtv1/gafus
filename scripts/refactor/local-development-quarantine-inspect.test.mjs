/** INFRA032: metadata-only supplied archive / SQL failclosed source acceptance. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  describeArchiveToc,
  inspectSuppliedArchive,
} from "./local-development-quarantine-inspect.mjs";

const core = ["User", "Course", "TrainingDay", "Step", "DayOnCourse", "StepOnDay"];
test("a minimal synthetic TOC is metadata, never a row dump", () => {
  const toc = core
    .map((name, i) => `${i + 1}; 1259 ${i + 200} TABLE public ${name} owner_hidden`)
    .concat(core.map((name, i) => `${i + 20}; 0 ${i + 200} TABLE DATA public ${name} owner_hidden`))
    .join("\n");
  const r = describeArchiveToc(toc, core.map((n) => `model ${n} {\n id String\n}`).join("\n"));
  assert.equal(r.objectCount, 12);
  assert.equal(r.corePresent, true);
  assert.equal(r.layoutMatches, false);
  assert.equal(r.publicTables, 6);
});
test("actual supplied archive: custom TOC and schema inventory only, no rows", () => {
  const r = inspectSuppliedArchive();
  assert.equal(r.objectCount, 1232);
  assert.equal(r.publicTables, 166);
  assert.equal(r.publicDataItems, 166);
  assert.equal(r.legacyPurchaseTables, 7);
  assert.equal(r.prismaOnly, 6);
  assert.equal(r.archiveOnly, 1);
  assert.equal(r.corePresent, true);
  assert.equal(r.layoutMatches, true);
});
test("inspect CLI does not reveal original names, real data or passwords", () => {
  const p = new URL("./local-development-quarantine-inspect.mjs", import.meta.url);
  const run = spawnSync(process.execPath, [p.pathname, "--inspect"], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH },
    encoding: "utf8",
    timeout: 8000,
  });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /TOC_ONLY_OK/);
  assert.match(run.stdout, /rows=NOT_READ DB=NOT_CONTACTED restore=BLOCKED/);
  assert.doesNotMatch(run.stdout, /owner_hidden|@|password|COPY|INSERT/i);
  const denied = spawnSync(process.execPath, [p.pathname, "--restore"], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH },
    encoding: "utf8",
    timeout: 8000,
  });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /INFRA032_INSPECT_ONLY_NO_RESTORE/);
});
test("nonexecuted SQL contains only 6 synthetic allowed data table INSERTs with quarantine guard", () => {
  const sql = readFileSync(
    new URL("./local-development-quarantine-sanitize.sql", import.meta.url),
    "utf8",
  );
  const tables = [...sql.matchAll(/^INSERT INTO public\."([A-Za-z_]+)"/gm)].map((x) => x[1]);
  assert.deepEqual(tables, ["User", "Course", "TrainingDay", "Step", "DayOnCourse", "StepOnDay"]);
  assert.ok(sql.includes("current_database() !~ '^gafus_refactor_local_quarantine_"));
  assert.ok(sql.includes("inet_server_addr()::text IS DISTINCT FROM '127.0.0.1'"));
  assert.ok(sql.includes("archived_count <> 7"));
  assert.ok(sql.includes("public_count <> 166"));
  assert.ok(sql.includes("DROP SCHEMA gafus_legacy_purchase_archive CASCADE;"));
  assert.ok(sql.includes("TRUNCATE TABLE "));
  assert.ok(sql.includes("_infra032_daylinks") && sql.includes("_infra032_steplinks"));
  assert.ok(sql.includes("ON COMMIT DROP"));
  assert.ok(
    sql.startsWith("-- INFRA032") &&
      sql.includes("\nBEGIN;\n") &&
      sql.trimEnd().endsWith("COMMIT;"),
  );
  assert.doesNotMatch(sql, /\bCOPY\s+.*\bTO\s+STDOUT/i);
});
