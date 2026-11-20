import assert from "node:assert/strict";
import { test, after } from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import {
  buildSignedOtaArtifact, verifyAndWriteLocalPreview, hashHex,
} from "./self-hosted-ota-artifact.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gafus-ota-signing-"));
const exports = path.join(root, "export");
fs.mkdirSync(path.join(exports, "bundles"), {recursive: true});
fs.mkdirSync(path.join(exports, "assets"), {recursive: true});
fs.writeFileSync(path.join(exports, "bundles/index.ios.hbc"), Buffer.from("Hermes Bytecode Synthetic Bundle Test".repeat(100)));
fs.writeFileSync(path.join(exports, "assets/test"), Buffer.from("PNG synthetic asset bytes"));
const keyFile = path.join(root,"key.pem");
const certFile = path.join(root,"cert.pem");
const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
fs.writeFileSync(keyFile,privateKey.export({type:"pkcs1",format:"pem"}), {mode: 0o600});
execFileSync("openssl", ["req", "-new", "-x509", "-key", keyFile, "-out", certFile, "-days", "1", "-subj", "/CN=gafus-ota-local-qa", "-addext", "extendedKeyUsage=codeSigning"],
  {stdio:"ignore"});
const certPem = fs.readFileSync(certFile,"utf8");
const privateKeyPem = fs.readFileSync(keyFile,"utf8");
const nativeFingerprint = "d".repeat(64);
const sourceSha = "a".repeat(40);
const cfg = { version: "1.7.5", scheme: ["gafus"],
  updates: { url: "https://preview.gafus.ru/ota/manifest" } };
const metadata = { bundler:"metro", version:0, fileMetadata:{ios:{bundle:"bundles/index.ios.hbc",assets:[{path:"assets/test",ext:"png"}]}}};
const native = {
  id:"87290d96-ea7d-4411-8463-8e57e8add5ec", verified:true, appVersion:"1.7.5",
  platform:"ios", environment:"preview", channel:"preview", runtimeVersion:"1.7.5",
  signingKeyId:"test-preview", sourceSha:"b".repeat(40),
  nativeFingerprint, updateUrl:cfg.updates.url,
  certificateSha256:hashHex(Buffer.from(certPem)),
};
const input = {
  exportRoot:exports, metadata, publicExpoConfig:cfg, native, sourceSha,
  nativeFingerprint, platform:"ios",environment:"preview",runtimeVersion:"1.7.5",
  channel:"preview", signingKeyId:"test-preview",
  publicCdnBase:"https://cdn.test/gafus/preview/assets/",
  updateId:"e6b00421-fc24-4bee-b315-774e9a090f57",
  createdAt:"2026-11-12T00:00:00.000Z", revision:1, certificatePem: certPem, privateKeyPem,
};
after(() => fs.rmSync(root,{recursive:true,force:true}));

test("signed Expo manifest has correct hash, metadata, immutable assets and certificate", () => {
  const result = buildSignedOtaArtifact(input);
  assert.equal(result.manifest.id,input.updateId);
  assert.equal(result.manifest.runtimeVersion,"1.7.5");
  assert.equal(result.inventory.length,2);
  assert.ok(result.manifest.launchAsset.url.startsWith("https://cdn.test/gafus/preview/assets/"));
  assert.ok(result.manifest.launchAsset.hash);
  assert.equal(result.manifest.assets[0].fileExtension,".png");
  const signature = Buffer.from(result.signatureHeader.match(/^sig="([^"]+)"/)?.[1] ?? "", "base64");
  assert.equal(crypto.verify("RSA-SHA256",result.manifestBytes,certPem,signature),true);
  const mutated = Buffer.from(result.manifestBytes);
  mutated[mutated.length-1] ^= 1;
  assert.equal(crypto.verify("RSA-SHA256",mutated,certPem,signature),false);
  const destination = path.join(root,"result");
  verifyAndWriteLocalPreview({artifact:result,exportRoot:exports,outputDir:destination});
  assert.equal(hashHex(fs.readFileSync(path.join(destination,"manifest.json"))),hashHex(result.manifestBytes));
  const diskFiles = fs.readdirSync(path.join(destination,"assets"));
  assert.equal(diskFiles.length,2);
  assert.throws(() => verifyAndWriteLocalPreview({artifact:result,exportRoot:exports,outputDir:destination}), /OTA_OUTPUT_MUST_BE_EMPTY/);
});

test("does not accept runtime mismatch, disabled native or wrong certificate fingerprint", () => {
  assert.throws(() => buildSignedOtaArtifact({...input,runtimeVersion:"1.7.6"}), /UNVERIFIED_NATIVE_RELEASE/);
  assert.throws(() => buildSignedOtaArtifact({...input,native:{...native,verified:false}}), /UNVERIFIED_NATIVE_RELEASE/);
  assert.throws(() => buildSignedOtaArtifact({...input,native:{...native,certificateSha256:"0".repeat(64)}}), /UNVERIFIED_NATIVE_RELEASE/);
  assert.throws(() => buildSignedOtaArtifact({...input,nativeFingerprint:"0".repeat(64)}), /UNVERIFIED_NATIVE_RELEASE/);
});

test("rejects asset directory traversal, unavailable files and unsupported extensions", () => {
  assert.throws(() => buildSignedOtaArtifact({...input,metadata:{...metadata,fileMetadata:{ios:{...metadata.fileMetadata.ios,bundle:"../etc/passwd"}}}}), /INVALID_EXPO_ASSET_PATH/);
  assert.throws(() => buildSignedOtaArtifact({...input,metadata:{...metadata,fileMetadata:{ios:{...metadata.fileMetadata.ios,bundle:"bundles/missing.hbc"}}}}), /ENOENT/);
  assert.throws(() => buildSignedOtaArtifact({...input,metadata:{...metadata,fileMetadata:{ios:{...metadata.fileMetadata.ios,assets:[{path:"assets/test",ext:"map"}]}}}}), /UNRECOGNIZED_ASSET_TYPE/);
});

test("certificate and private key must match; no signed release on wrong signer", () => {
  const another = crypto.generateKeyPairSync("rsa",{modulusLength:2048});
  assert.throws(() => buildSignedOtaArtifact({...input,privateKeyPem:another.privateKey.export({type:"pkcs1",format:"pem"})}),/SIGNATURE_CERTIFICATE_MISMATCH/);
});

test("rejects insecure CDN and invalid update UUID", () => {
  assert.throws(() => buildSignedOtaArtifact({...input,publicCdnBase:"http://cdn.test/"}),/INSECURE_CDN_URL/);
  assert.throws(() => buildSignedOtaArtifact({...input,updateId:"fake"}),/INVALID_SOURCE_RELEASE_METADATA/);
});


test("rejects missing Expo Router scheme before signing and uploading", () => {
  const noScheme = {...cfg};
  delete noScheme.scheme;
  assert.throws(() => buildSignedOtaArtifact({...input,publicExpoConfig:noScheme}),
    /EXPO_CONFIG_SCHEME_REQUIRED/);
  assert.throws(() => buildSignedOtaArtifact({
    ...input,publicExpoConfig:{...cfg,scheme:[]},
  }), /EXPO_CONFIG_SCHEME_REQUIRED/);
});

test("rejects a valid RSA signer without required codeSigning certificate EKU", () => {
  const certWithoutEkuFile = path.join(root,"cert-without-code-signing-eku.pem");
  execFileSync("openssl", ["req","-new","-x509","-key",keyFile,
    "-out",certWithoutEkuFile,"-days","1","-subj","/CN=gafus-invalid-ota-test"],
    {stdio:"ignore"});
  const withoutEku = fs.readFileSync(certWithoutEkuFile,"utf8");
  assert.throws(() => buildSignedOtaArtifact({
    ...input,certificatePem:withoutEku,
    native:{...native,certificateSha256:hashHex(Buffer.from(withoutEku))},
  }), /OTA_CERTIFICATE_CODE_SIGNING_EKU_REQUIRED/);
});

test("the release signer checks the revision embedded in the Hermes bundle", () => {
  const file = path.join(exports, metadata.fileMetadata.ios.bundle);
  const original = fs.readFileSync(file);
  const required = { ...input, requireCompiledRevision: true };
  assert.throws(() => buildSignedOtaArtifact(required), /OTA_COMPILED_REVISION_MISMATCH/);
  try {
    fs.writeFileSync(file, Buffer.concat([original, Buffer.from("gafus-ota-revision:12")]));
    assert.throws(() => buildSignedOtaArtifact(required), /OTA_COMPILED_REVISION_MISMATCH/);
    fs.writeFileSync(file, Buffer.concat([original, Buffer.from("gafus-ota-revision:1")]));
    assert.doesNotThrow(() => buildSignedOtaArtifact(required));
  } finally {
    fs.writeFileSync(file, original);
  }
});
