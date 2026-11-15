const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { applyNativeSelfHostedProfile } = require("./self-hosted-native-profile.cjs");
const dir = fs.mkdtempSync(path.join(os.tmpdir(),"gafus-native-ota-"));
fs.mkdirSync(path.join(dir,".ota-certs"));
const { privateKey } = crypto.generateKeyPairSync("rsa",{modulusLength:2048});
const keyPath=path.join(dir,"key.pem");
const certPath=path.join(dir,".ota-certs","preview.pem");
fs.writeFileSync(keyPath,privateKey.export({format:"pem",type:"pkcs1"}),{mode:0o600});
execFileSync("openssl",["req","-new","-x509","-key",keyPath,"-out",certPath,"-days","1","-subj","/CN=gafus-preview-qa"],{stdio:"ignore"});
const certHash=crypto.createHash("sha256").update(fs.readFileSync(certPath)).digest("hex");
const descriptor={
  id:"9f15a56e-8fe0-4b5c-bc67-6980d7446322",environment:"preview",platform:"ios",
  channel:"preview",runtimeVersion:"1.7.5",signingKeyId:"preview-main",appVersion:"1.7.5",buildNumber:"175",
  updateUrl:"https://preview.gafus.ru/ota/manifest",certificateSha256:certHash,
  nativeFingerprint:"b".repeat(64),
};
const descriptorPath=path.join(dir,"native.json");
fs.writeFileSync(descriptorPath,JSON.stringify(descriptor));
const base={version:"1.7.5",runtimeVersion:{policy:"appVersion"},updates:{url:"https://u.expo.dev/original",checkAutomatically:"ON_LOAD"},extra:{keep:true}};
const env={GAFUS_OTA_TRANSPORT:"self-hosted",GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR:descriptorPath,
  GAFUS_OTA_NATIVE_CERTIFICATE:".ota-certs/preview.pem",GAFUS_OTA_TARGET_PLATFORM:"ios"};
after(()=>fs.rmSync(dir,{recursive:true,force:true}));
test("default native EAS config unchanged",()=>{
  assert.equal(applyNativeSelfHostedProfile(base,{environment:{},appRoot:dir}),base);
});
test("preview native profile switches only explicit verified target and certificate",()=>{
  const result=applyNativeSelfHostedProfile(base,{environment:env,appRoot:dir});
  assert.equal(result.updates.url,descriptor.updateUrl);
  assert.equal(result.updates.codeSigningMetadata.alg,"rsa-v1_5-sha256");
  assert.equal(result.updates.codeSigningCertificate,"./.ota-certs/preview.pem");
  assert.equal(result.updates.requestHeaders["expo-channel-name"],"preview");
  assert.equal(result.updates.checkAutomatically,"NEVER");
  assert.equal(result.updates.requestHeaders["x-gafus-native-fingerprint"],descriptor.nativeFingerprint);
  assert.equal(result.extra.keep,true);
  assert.equal(result.extra.otaNativeFingerprint,descriptor.nativeFingerprint);
});
test("legacy native version and mismatched target are never reused",()=>{
  assert.throws(()=>applyNativeSelfHostedProfile({...base,version:"1.7.4"},{environment:env,appRoot:dir}),/SELF_HOSTED_NATIVE_APP_VERSION_RUNTIME_MISMATCH/);
  assert.throws(()=>applyNativeSelfHostedProfile(base,{environment:{...env,GAFUS_OTA_TARGET_PLATFORM:"android"},appRoot:dir}),/SELF_HOSTED_NATIVE_PLATFORM_MISMATCH/);
});
test("production cannot be selected outside protected CI",()=>{
  fs.writeFileSync(descriptorPath,JSON.stringify({...descriptor,environment:"production"}));
  assert.throws(()=>applyNativeSelfHostedProfile(base,{environment:env,appRoot:dir}),/SELF_HOSTED_PRODUCTION_REQUIRES_APPROVED_CI/);
  fs.writeFileSync(descriptorPath,JSON.stringify(descriptor));
});
test("certificate mismatch and disallowed endpoint fail closed",()=>{
  fs.writeFileSync(descriptorPath,JSON.stringify({...descriptor,certificateSha256:"0".repeat(64)}));
  assert.throws(()=>applyNativeSelfHostedProfile(base,{environment:env,appRoot:dir}),/SELF_HOSTED_CERTIFICATE_MISMATCH/);
  fs.writeFileSync(descriptorPath,JSON.stringify({...descriptor,updateUrl:"https://gafus.ru/ota/manifest"}));
  assert.throws(()=>applyNativeSelfHostedProfile(base,{environment:env,appRoot:dir}),/SELF_HOSTED_NATIVE_OTA_ENDPOINT_INVALID/);
  fs.writeFileSync(descriptorPath,JSON.stringify(descriptor));
});
