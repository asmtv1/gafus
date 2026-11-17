import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { computeNativeSourceFingerprint } from "./native-source-fingerprint.mjs";
const root=fs.mkdtempSync(path.join(os.tmpdir(),"gafus-native-fingerprint-"));
const run=(args)=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
run(["init","--quiet"]);
run(["config","user.name","QA"]);run(["config","user.email","qa@example.invalid"]);
const tracked=["pnpm-lock.yaml","apps/mobile/app.json","apps/mobile/app.config.js",
  "apps/mobile/eas.json","apps/mobile/package.json","apps/mobile/metro.config.js",
  "apps/mobile/babel.config.js","apps/mobile/scripts/self-hosted-native-profile.cjs",
  "apps/mobile/ios/Podfile","apps/mobile/src/screen.tsx"];
for(const file of tracked){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),`before ${file}\n`);}
run(["add","."]);run(["commit","--quiet","-m","baseline"]);
const native={platform:"ios",environment:"preview",channel:"preview",runtimeVersion:"1.7.5",
  appVersion:"1.7.5",signingKeyId:"main",certificateSha256:"a".repeat(64),
  updateUrl:"https://preview.gafus.test/ota/manifest"};
after(()=>fs.rmSync(root,{recursive:true,force:true}));
test("reproducible fingerprint on exact source and native profile",()=>{
  const first=computeNativeSourceFingerprint(root,native);
  const again=computeNativeSourceFingerprint(root,native);
  assert.deepEqual(first,again);assert.match(first.fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(first.fileCount,9);
});
test("JS-only changes do not modify native fingerprint",()=>{
  const first=computeNativeSourceFingerprint(root,native);
  fs.writeFileSync(path.join(root,"apps/mobile/src/screen.tsx"),"changed JS-only\n");
  assert.equal(computeNativeSourceFingerprint(root,native).fingerprint,first.fingerprint);
});
test("untracked native Expo config plugin changes the fingerprint before commit",()=>{
  const base=computeNativeSourceFingerprint(root,native);
  const file=path.join(root,"apps/mobile/plugins/withStoreKitOnlyTest.js");
  fs.mkdirSync(path.dirname(file),{recursive:true});
  try {
    fs.writeFileSync(file,"module.exports = 'plugin-v1';\n");
    const candidate=computeNativeSourceFingerprint(root,native);
    assert.notEqual(candidate.fingerprint,base.fingerprint);
    assert.equal(candidate.fileCount,base.fileCount+1);
    fs.writeFileSync(file,"module.exports = 'plugin-v2';\n");
    assert.notEqual(computeNativeSourceFingerprint(root,native).fingerprint,candidate.fingerprint);
  }finally {fs.rmSync(file,{force:true});}
  assert.equal(computeNativeSourceFingerprint(root,native).fingerprint,base.fingerprint);
});
test("self-hosted OTA native timeout profile drift changes native fingerprint",()=>{
  const baseline=computeNativeSourceFingerprint(root,native);
  const file=path.join(root,"apps/mobile/scripts/self-hosted-native-profile.cjs");
  const before=fs.readFileSync(file);
  try {
    fs.writeFileSync(file,"module.exports={androidOtaTimeoutMs:60000};\n");
    const changed=computeNativeSourceFingerprint(root,native);
    assert.notEqual(changed.fingerprint,baseline.fingerprint);
    assert.equal(changed.fileCount,baseline.fileCount);
  }finally{fs.writeFileSync(file,before);}
  assert.equal(computeNativeSourceFingerprint(root,native).fingerprint,baseline.fingerprint);
});
test("untracked JS-only source does not change native fingerprint",()=>{
  const baseline=computeNativeSourceFingerprint(root,native);
  const file=path.join(root,"apps/mobile/src/local-only-untracked.ts");
  fs.writeFileSync(file,"export const changed = true;\n");
  try {assert.equal(computeNativeSourceFingerprint(root,native).fingerprint,baseline.fingerprint);}
  finally{fs.rmSync(file,{force:true});}
});
test("native dependency or endpoint drift cannot use the old binary",()=>{
  const original=computeNativeSourceFingerprint(root,native).fingerprint;
  assert.notEqual(computeNativeSourceFingerprint(root,{...native,updateUrl:"https://other.test/ota/manifest"}).fingerprint,original);
  assert.notEqual(computeNativeSourceFingerprint(root,{...native,certificateSha256:"b".repeat(64)}).fingerprint,original);
  fs.writeFileSync(path.join(root,"apps/mobile/ios/Podfile"),"changed native module\n");
  assert.notEqual(computeNativeSourceFingerprint(root,native).fingerprint,original);
});
