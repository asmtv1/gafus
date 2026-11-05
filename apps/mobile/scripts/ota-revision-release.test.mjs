import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { withCompiledOtaRevision } from "./ota-revision-release.mjs";
const baseline = "/** generated */\nexport const OTA_COMPILED_REVISION = 0;\n";
test("publisher writes a revision into the JS source and restores baseline after success", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gafus-ota-revision-"));
  const path = join(dir,"revision.ts");
  try {
    writeFileSync(path, baseline);
    await withCompiledOtaRevision(17, async () => {
      assert.match(readFileSync(path,"utf8"), /OTA_COMPILED_REVISION = 17/);
    },path);
    assert.equal(readFileSync(path,"utf8"),baseline);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
test("publisher restores version 0 even if EAS fails", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gafus-ota-revision-"));
  const path = join(dir,"revision.ts");
  try {
    writeFileSync(path,baseline);
    await assert.rejects(withCompiledOtaRevision(1,async () => {
      throw new Error("EAS_UNAVAILABLE");
    },path), /EAS_UNAVAILABLE/);
    assert.equal(readFileSync(path,"utf8"),baseline);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
test("publisher refuses invalid revision and a dirty revision source", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gafus-ota-revision-"));
  const path = join(dir,"revision.ts");
  try {
    writeFileSync(path,baseline);
    await assert.rejects(withCompiledOtaRevision(0,async()=>{},path),/OTA_REVISION_INVALID/);
    writeFileSync(path,baseline.replace("= 0;","= 2;"));
    await assert.rejects(withCompiledOtaRevision(3,async()=>{},path),/OTA_REVISION_SOURCE_NOT_BASELINE_ZERO/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
