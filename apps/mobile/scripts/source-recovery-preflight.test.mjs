import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { checkSourceRecoveryDefinition, dryRunSourceRecovery } from "./source-recovery-preflight.mjs";
const root=fs.mkdtempSync(path.join(os.tmpdir(),"gafus-source-recovery-qa-"));
const repo=path.join(root,"repository");
fs.mkdirSync(repo);
const run=(args)=>execFileSync("git",args,{cwd:repo,encoding:"utf8"}).trim();
run(["init","--quiet"]);
run(["config","user.name","GAFUS QA"]);
run(["config","user.email","qa@example.invalid"]);
const relative="apps/mobile/src/features/app-subscription/lib/apple-checkout-policy.ts";
const file=path.join(repo,relative);
fs.mkdirSync(path.dirname(file),{recursive:true});
fs.writeFileSync(file,"export const allowed = false;\n");
run(["add","."]);run(["commit","--quiet","-m","Synthetic source baseline"]);
const baseSha=run(["rev-parse","HEAD"]);
fs.writeFileSync(file,"export const allowed = true;\n");
const patch=run(["diff","--binary","--",relative])+"\n";
const patchPath=path.join(root,"private.patch");
fs.writeFileSync(patchPath,patch,{mode:0o600});
fs.writeFileSync(file,"export const allowed = false;\n");
const definition={version:"1.0.0",kind:"IOS_CHECKOUT_SOURCE_RECOVERY",
  sha256:crypto.createHash("sha256").update(patch).digest("hex"),
  sourceLocation:`private://mobile-patches/qa-${baseSha}.patch`,
  allowedBases:[baseSha],allowedPaths:[relative],nativeRequirements:{
    publication:"NEW_NATIVE_BUILD_AND_APP_REVIEW",targetPlatform:"ios",
    minimumVersion:"1.7.5",otaCompatible:false,
  },
};
after(()=>fs.rmSync(root,{recursive:true,force:true}));
test("approved source-only patch applied ONLY in sandbox, with deterministic exact SHA output",()=>{
  const output=path.join(root,"positive");
  const result=dryRunSourceRecovery({repositoryRoot:repo,baseSha,patchPath,definition,outputDir:output});
  assert.equal(result.compatible,true);
  assert.equal(result.patchSha256,definition.sha256);
  assert.deepEqual(result.changedPaths,[relative]);
  assert.match(result.resultTreeSha,/^[a-f0-9]{40,64}$/);
  assert.equal(fs.readFileSync(file,"utf8"),"export const allowed = false;\n");
  assert.equal(run(["status","--porcelain"]),"");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output,"verification.json"),"utf8")),result);
  assert.throws(()=>dryRunSourceRecovery({repositoryRoot:repo,baseSha,patchPath,definition,outputDir:output}),/RECOVERY_OUTPUT_MUST_BE_EMPTY/);
});
test("CLI accepts a version-scoped approved patch but does not touch source checkout",()=>{
  const definitionPath=path.join(root,"approved-definition.json");
  fs.writeFileSync(definitionPath,JSON.stringify(definition));
  const cli=path.join(path.dirname(new URL(import.meta.url).pathname),"run-source-recovery-preflight.mjs");
  const output=path.join(root,"cli-result");
  const raw=execFileSync(process.execPath,[cli,
    "--repository",repo,"--base-sha",baseSha,"--patch",patchPath,
    "--definition",definitionPath,"--output",output,
  ],{encoding:"utf8"});
  const result=JSON.parse(raw);
  assert.equal(result.status,"DRY_RUN_PASS_NO_PRODUCTION_CHANGE");
  assert.equal(fs.readFileSync(file,"utf8"),"export const allowed = false;\n");
  assert.equal(run(["status","--porcelain"]),"");
});
test("rejects patch with unknown SHA, wrong allowed base or unexpected path",()=>{
  assert.throws(()=>checkSourceRecoveryDefinition({...definition,sha256:"0".repeat(64)},Buffer.from(patch)),/SOURCE_PATCH_SHA256_MISMATCH/);
  assert.throws(()=>dryRunSourceRecovery({repositoryRoot:repo,baseSha:"a".repeat(40),patchPath,definition,outputDir:path.join(root,"wrong-base")}),/SOURCE_PATCH_BASE_NOT_APPROVED/);
  assert.throws(()=>dryRunSourceRecovery({repositoryRoot:repo,baseSha,patchPath,definition:{...definition,allowedPaths:["apps/mobile/src/features/app-subscription/lib/other.ts"]},outputDir:path.join(root,"forbidden-path")}),/SOURCE_PATCH_TOUCHES_FORBIDDEN_PATH/);
});
test("no arbitrary commands, native source or OTA release can be included",()=>{
  for(const allowedPaths of [["apps/mobile/app.config.js"],["apps/mobile/ios/Podfile"],["apps/mobile/src/features/app-subscription/lib/mutate.sh"],["../../etc/passwd"]]) {
    assert.throws(()=>checkSourceRecoveryDefinition({...definition,allowedPaths},Buffer.from(patch)),/SOURCE_PATCH_PATHS_NOT_ALLOWED/);
  }
  assert.throws(()=>checkSourceRecoveryDefinition({...definition,nativeRequirements:{...definition.nativeRequirements,publication:"OTA"}},Buffer.from(patch)),/INVALID_PATCH_PUBLICATION_SCOPE/);
  assert.throws(()=>dryRunSourceRecovery({repositoryRoot:repo,baseSha,patchPath,definition:{...definition,nativeRequirements:{...definition.nativeRequirements,otaCompatible:true}},outputDir:path.join(root,"unexpected-ota")}),/SOURCE_RECOVERY_MUST_NOT_BE_OTA_COMPATIBLE/);
});
test("patch does not bypass modified base, even when base SHA is whitelisted",()=>{
  const wrongFile="apps/mobile/src/features/app-subscription/lib/other.ts";
  const changed=path.join(repo,wrongFile);fs.writeFileSync(changed,"export const different = false;\n");
  run(["add",wrongFile]);run(["commit","--quiet","-m","Other baseline"]);
  const otherSha=run(["rev-parse","HEAD"]);
  assert.throws(()=>dryRunSourceRecovery({repositoryRoot:repo,baseSha:otherSha,patchPath,definition,outputDir:path.join(root,"not-approved")}),/SOURCE_PATCH_BASE_NOT_APPROVED/);
});
