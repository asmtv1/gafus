import { randomUUID, createHash, generateKeyPairSync, sign, constants } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  ciSignedReleaseSchema, validateSignedOtaCiResult, matchesStoredOtaCiReplay,
  type NativeTrustRecord, type StoredOtaCiReplay, type StoredOtaArtifact,
} from "./ci-registration";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gafus-ci-crypto-"));
const keyFile = path.join(temp, "key.pem");
const certFile = path.join(temp, "cert.pem");
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
fs.writeFileSync(keyFile, privateKey.export({type:"pkcs1",format:"pem"}), {mode: 0o600});
execFileSync("openssl", ["req", "-new", "-x509", "-key", keyFile, "-out", certFile,
  "-days", "1", "-subj", "/CN=ota-ci-test"], {stdio:"ignore"});
const cert = fs.readFileSync(certFile,"utf8");
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const native: NativeTrustRecord = {
  id: randomUUID(), appId:"gafus", platform:"ios", environment:"preview", channel:"preview",
  runtimeVersion:"1.7.5", signingKeyId:"preview-main", verified:true,
  nativeFingerprint:"a".repeat(64), certificateSha256:sha(Buffer.from(cert)), certificatePem:cert,
};
const artifactData = Buffer.from("sample exported Hermes bundle bytes");
const artifactSha = sha(artifactData);
const key = `${artifactSha}.hbc`;
const asset = {
  key, immutableUrl:`https://cdn.test/ota/preview/gafus/1.7.5/ios/assets/${key}`,
  sha256:artifactSha, mimeType:"application/javascript", sizeBytes:artifactData.length,
  cdnVerified:true as const, s3Verified:true as const,
};
const sourceSha = "b".repeat(40);
function signedCandidate(overrideAssetUrl: string = asset.immutableUrl) {
  const manifest = {
    id:randomUUID(),createdAt:"2026-11-12T17:30:00.000Z",runtimeVersion:"1.7.5",
    launchAsset: {url:overrideAssetUrl,hash:Buffer.from(artifactSha,"hex").toString("base64url"),
      key:"e".repeat(32),contentType:asset.mimeType}, assets:[],
    metadata:{channel:"preview",environment:"preview",sourceSha},extra:{ota:{revision:7}},
  };
  const bytes = Buffer.from(JSON.stringify(manifest));
  const signature = sign("RSA-SHA256",bytes,{key:privateKey,padding:constants.RSA_PKCS1_PADDING});
  const raw = {
    operationId:`qa-build-${randomUUID()}`,nativeReleaseId:native.id,updateId:manifest.id,
    sourceSha,revision:7,buildAttempt:1,ciRunId:"workflow-1234",
    manifestBase64:bytes.toString("base64"),
    signatureHeader:`sig="${signature.toString("base64")}", keyid="preview-main", alg="rsa-v1_5-sha256"`,
    artifacts:[{...asset,immutableUrl:overrideAssetUrl}],
    checks:{unit:true,mobileTypecheck:true,nativeCompatibility:true,iosPaymentGraph:true,privateSymbols:true} as const,
    symbolsRef:"symbols-s3:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  };
  return { raw, manifest, bytes };
}
afterAll(()=>fs.rmSync(temp,{recursive:true,force:true}));
describe("signed OTA CI result verification", () => {
  it("replays an identical signed OTA receipt across GitHub retry attempts only", () => {
    const {raw,bytes} = signedCandidate();
    const candidate = ciSignedReleaseSchema.parse(raw);
    const saved: StoredOtaCiReplay = {
      id:randomUUID(),nativeReleaseId:candidate.nativeReleaseId,
      updateId:candidate.updateId,revision:candidate.revision,sourceSha:candidate.sourceSha,
      signatureHeader:candidate.signatureHeader,manifestBody:bytes,
      symbolsRef:candidate.symbolsRef,ciRunId:candidate.ciRunId,
      checks:{...candidate.checks},state:"READY",
    };
    const savedAssets: StoredOtaArtifact[] = [{
      assetKey:asset.key,immutableUrl:asset.immutableUrl,sha256:asset.sha256,
      mimeType:asset.mimeType,sizeBytes:BigInt(asset.sizeBytes),verified:true,
    }];
    expect(matchesStoredOtaCiReplay(saved,savedAssets,{...candidate,buildAttempt:2},bytes)).toBe(true);
    for (const modified of [
      {...candidate,nativeReleaseId:randomUUID()},
      {...candidate,symbolsRef:"symbols-s3:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"},
      {...candidate,ciRunId:"another-workflow"},
      {...candidate,sourceSha:"c".repeat(40)},
      {...candidate,signatureHeader:candidate.signatureHeader+"tampered"},
      {...candidate,updateId:randomUUID()},
      {...candidate,revision:candidate.revision+1},
      {...candidate,checks:{...candidate.checks,iosPaymentGraph:false}},
    ]) expect(matchesStoredOtaCiReplay(saved,savedAssets,modified,bytes)).toBe(false);
    expect(matchesStoredOtaCiReplay(saved,savedAssets,candidate,Buffer.from("other-bytes"))).toBe(false);
    expect(matchesStoredOtaCiReplay({...saved,state:"FAILED"},savedAssets,candidate,bytes)).toBe(false);
    expect(matchesStoredOtaCiReplay(saved,[],candidate,bytes)).toBe(false);
    for(const changed of [
      {...savedAssets[0],assetKey:"a".repeat(64)+".hbc"},
      {...savedAssets[0],sha256:"0".repeat(64)},
      {...savedAssets[0],sizeBytes:BigInt(asset.sizeBytes+1)},
      {...savedAssets[0],verified:false},
    ]) expect(matchesStoredOtaCiReplay(saved,[changed],candidate,bytes)).toBe(false);
  });
  it("accepts actual RSA signature, exact SHA256 and a verified runtime", () => {
    const {raw,bytes}=signedCandidate();
    const parsed=ciSignedReleaseSchema.parse(raw);
    const validated=validateSignedOtaCiResult(native,parsed,"https://cdn.test");
    expect(validated.manifestBody).toEqual(bytes);
    expect(validated.createdAt.toISOString()).toBe("2026-11-12T17:30:00.000Z");
  });
  it("accepts signed immutable assets directly from the specified Cloud.ru S3 bucket", () => {
    const s3Base = "https://global.s3.cloud.ru/gafus-ota-updates";
    const url = `${s3Base}/ota/preview/gafus/1.7.5/ios/assets/${key}`;
    const {raw} = signedCandidate(url);
    expect(validateSignedOtaCiResult(native,raw,s3Base).createdAt.toISOString())
      .toBe("2026-11-12T17:30:00.000Z");
    expect(validateSignedOtaCiResult(native,raw,s3Base+"/").manifestBody.length).toBeGreaterThan(0);
    for (const otherBase of [
      "https://global.s3.cloud.ru/gafus-other-bucket",
      "https://global.s3.cloud.ru",
      "https://s3.cloud.ru/gafus-ota-updates",
    ]) {
      expect(()=>validateSignedOtaCiResult(native,raw,otherBase))
        .toThrow("INVALID_SIGNED_ASSET");
    }
    const wrongKey = url.replace("/ios/assets/", "/android/assets/");
    expect(()=>validateSignedOtaCiResult(native,signedCandidate(wrongKey).raw,s3Base))
      .toThrow("INVALID_SIGNED_ASSET");
    const wrongBucket = url.replace("/gafus-ota-updates/", "/gafus-other-bucket/");
    expect(()=>validateSignedOtaCiResult(native,signedCandidate(wrongBucket).raw,s3Base))
      .toThrow("INVALID_SIGNED_ASSET");
  });
  it("rejects tampered manifest body", () => {
    const {raw,manifest}=signedCandidate();
    const fake=Buffer.from(JSON.stringify({...manifest,runtimeVersion:"1.7.6"})).toString("base64");
    expect(()=>validateSignedOtaCiResult(native,{...raw,manifestBase64:fake},"https://cdn.test"))
      .toThrow("SIGNATURE_INVALID");
  });
  it("rejects wrong signing key, certificate and revoked native", () => {
    const {raw}=signedCandidate();
    expect(()=>validateSignedOtaCiResult({...native,verified:false},raw,"https://cdn.test"))
      .toThrow("UNVERIFIED_NATIVE_RELEASE");
    expect(()=>validateSignedOtaCiResult({...native,certificateSha256:"0".repeat(64)},raw,"https://cdn.test"))
      .toThrow("CERTIFICATE_HASH_MISMATCH");
    expect(()=>validateSignedOtaCiResult({...native,signingKeyId:"wrong-key"},raw,"https://cdn.test"))
      .toThrow("SIGNATURE_KEY_MISMATCH");
  });
  it("does not accept a validly signed bundle from the wrong platform or runtime CDN prefix", () => {
    for (const changed of [
      asset.immutableUrl.replace("/ios/assets/","/android/assets/"),
      asset.immutableUrl.replace("/1.7.5/ios/","/1.7.6/ios/"),
      asset.immutableUrl.replace("/ios/assets/","/ios/public/"),
    ]) {
      const {raw} = signedCandidate(changed);
      expect(()=>validateSignedOtaCiResult(native,raw,"https://cdn.test"))
        .toThrow("INVALID_SIGNED_ASSET");
    }
  });
  it("rejects wrong runtime, source SHA or revision even if signature is valid", () => {
    const {raw}=signedCandidate();
    expect(()=>validateSignedOtaCiResult({...native,runtimeVersion:"1.7.6"},raw,"https://cdn.test"))
      .toThrow("MANIFEST_NATIVE_RUNTIME_MISMATCH");
    expect(()=>validateSignedOtaCiResult(native,{...raw,sourceSha:"c".repeat(40)},"https://cdn.test"))
      .toThrow("MANIFEST_NATIVE_RUNTIME_MISMATCH");
    expect(()=>validateSignedOtaCiResult(native,{...raw,revision:8},"https://cdn.test"))
      .toThrow("MANIFEST_NATIVE_RUNTIME_MISMATCH");
  });
  it("rejects failed iOS graph and missing private symbols result", () => {
    const {raw}=signedCandidate();
    expect(()=>validateSignedOtaCiResult(native,{...raw,checks:{...raw.checks,iosPaymentGraph:false}},"https://cdn.test"))
      .toThrow("REQUIRED_CI_CHECK_MISSING");
    expect(()=>ciSignedReleaseSchema.parse({...raw,checks:{...raw.checks,privateSymbols:false}}))
      .toThrow();
  });
  it("rejects substituted CDN host, artifact hash and duplicate assets", () => {
    const {raw}=signedCandidate();
    expect(()=>validateSignedOtaCiResult(native,{...raw,artifacts:[{...asset,immutableUrl:asset.immutableUrl.replace("cdn.test","evil.test")}]},"https://cdn.test"))
      .toThrow("MISSING_SIGNED_ASSET");
    expect(()=>validateSignedOtaCiResult(native,{...raw,artifacts:[{...asset,sha256:"0".repeat(64)}]},"https://cdn.test"))
      .toThrow("INVALID_SIGNED_ASSET");
    expect(()=>validateSignedOtaCiResult(native,{...raw,artifacts:[asset,asset]},"https://cdn.test"))
      .toThrow("MANIFEST_ASSET_COUNT_MISMATCH");
  });
  it("rejects arbitrary extra callback fields before verification", () => {
    const {raw}=signedCandidate();
    expect(ciSignedReleaseSchema.safeParse({...raw,commands:"bash -c evil"}).success).toBe(false);
    expect(ciSignedReleaseSchema.safeParse({...raw,buildAttempt:0}).success).toBe(false);
  });
});
