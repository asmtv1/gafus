/** On isolated local PG only; no S3, CDN, Apple or production access. */
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { registerVerifiedOtaCiResult, ciSignedReleaseSchema } from "../src/ci-registration";

const configured = process.env.GAFUS_OTA_TEST_PG_URL;
if (configured && process.env.DATABASE_URL !== configured) throw Error("OTA_TEST_DATABASE_MISMATCH");
const suite = configured ? describe : describe.skip;
const nativeId = crypto.randomUUID();
const updateId = crypto.randomUUID();
const appId = `ota-ci-qa-${crypto.randomUUID().slice(0,8)}`;
const sourceSha = "1".repeat(40);
const nativeFingerprint = "2".repeat(64);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(),"gafus-ci-realpg-"));
const pem = path.join(tmpDir,"private-key.pem");
const certFile = path.join(tmpDir,"public-cert.pem");
const {privateKey}=crypto.generateKeyPairSync("rsa",{modulusLength:2048});
fs.writeFileSync(pem,privateKey.export({type:"pkcs1",format:"pem"}),{mode:0o600});
execFileSync("openssl",["req","-new","-x509","-key",pem,"-out",certFile,
  "-days","1","-subj","/CN=GAFUS ci replay local QA"],{stdio:"ignore"});
const certificatePem=fs.readFileSync(certFile,"utf8");
const certificateSha256=crypto.createHash("sha256").update(certificatePem).digest("hex");
const artifactBytes=Buffer.from("GAFUS signed preview Hermes test bundle");
const artifactSha=crypto.createHash("sha256").update(artifactBytes).digest("hex");
const assetKey=`${artifactSha}.hbc`;
const assetUrl=`https://cdn.example.test/ota/preview/gafus/1.7.5/ios/assets/${assetKey}`;
function makeCandidate() {
  const body=Buffer.from(JSON.stringify({
    id:updateId,createdAt:"2026-11-12T18:00:00.000Z",runtimeVersion:"1.7.5",
    launchAsset:{url:assetUrl,hash:Buffer.from(artifactSha,"hex").toString("base64url"),
      contentType:"application/javascript",key:"a".repeat(32)},assets:[],
    metadata:{channel:"preview",environment:"preview",sourceSha},
    extra:{ota:{revision:1}},
  }));
  const signature=crypto.sign("RSA-SHA256",body,{key:privateKey,padding:crypto.constants.RSA_PKCS1_PADDING});
  return ciSignedReleaseSchema.parse({
    operationId:`qa-realpg-${updateId}`,nativeReleaseId:nativeId,updateId,
    sourceSha,revision:1,buildAttempt:1,ciRunId:"workflow-qa-run-1234",
    manifestBase64:body.toString("base64"),
    signatureHeader:`sig="${signature.toString("base64")}", keyid="qa-replay", alg="rsa-v1_5-sha256"`,
    artifacts:[{key:assetKey,immutableUrl:assetUrl,sha256:artifactSha,
      mimeType:"application/javascript",sizeBytes:artifactBytes.length,cdnVerified:true,s3Verified:true}],
    checks:{unit:true,mobileTypecheck:true,nativeCompatibility:true,iosPaymentGraph:true,appTracer:true},
    appTracerRef:"apptracer:ota-replay-qa",
  });
}
let releaseId:string|null=null;
suite("CI callback idempotency on migrated isolated PostgreSQL",()=>{
  beforeAll(async()=>{
    await prisma.$executeRaw`
      INSERT INTO "MobileNativeRelease"
      (id,"appId",platform,environment,distribution,"bundleId","appVersion","buildNumber",
       "runtimeVersion",channel,"updateUrl","signingKeyId","certificateSha256","certificatePem",
       "nativeFingerprint","sourceSha",verified)
      VALUES (${nativeId}::uuid,${appId},'ios','preview','internal','ru.gafus.app',
        '1.7.5','qa-ci','1.7.5','preview','https://preview.gafus.test/ota/manifest',
        'qa-replay',${certificateSha256},${certificatePem},${nativeFingerprint},${sourceSha},true)
    `;
  });
  afterAll(async()=>{
    if (releaseId) {
      await prisma.$executeRaw`DELETE FROM "MobileOtaArtifact" WHERE "releaseId"=${releaseId}::uuid`;
      await prisma.$executeRaw`DELETE FROM "MobileOtaRelease" WHERE id=${releaseId}::uuid`;
    }
    await prisma.$executeRaw`DELETE FROM "MobileNativeRelease" WHERE id=${nativeId}::uuid`;
    await prisma.$disconnect();
    fs.rmSync(tmpDir,{recursive:true,force:true});
  });
  it("accepts one signed, verified update as READY; idempotent after GitHub run attempt",async()=>{
    const input=makeCandidate();
    const initial=await registerVerifiedOtaCiResult(input,"https://cdn.example.test");
    releaseId=initial.releaseId;
    expect(initial.replayed).toBe(false);
    const repeated=await registerVerifiedOtaCiResult({...input,buildAttempt:2},"https://cdn.example.test");
    expect(repeated).toEqual({releaseId,replayed:true});
    const rows=await prisma.$queryRaw<{state:string;nativeReleaseId:string;buildAttempt:number}[]>`
      SELECT state,"nativeReleaseId","buildAttempt" FROM "MobileOtaRelease" WHERE id=${releaseId}::uuid
    `;
    expect(rows).toEqual([{state:"READY",nativeReleaseId:nativeId,buildAttempt:1}]);
    const inventory=await prisma.$queryRaw<{assetKey:string;sizeBytes:bigint;verified:boolean}[]>`
      SELECT "assetKey","sizeBytes",verified FROM "MobileOtaArtifact" WHERE "releaseId"=${releaseId}::uuid
    `;
    expect(inventory).toEqual([{assetKey,sizeBytes:BigInt(artifactBytes.length),verified:true}]);
  });
  it("rejects changed receipt identity or artifact metadata without mutating READY",async()=>{
    const input=makeCandidate();
    for (const changed of [
      {...input,appTracerRef:"apptracer:replacement"},
      {...input,ciRunId:"different-run-5678"},
      {...input,artifacts:[{...input.artifacts[0],sizeBytes:input.artifacts[0].sizeBytes+1}]},
    ]) {
      await expect(registerVerifiedOtaCiResult(changed,"https://cdn.example.test"))
        .rejects.toMatchObject({code:"OPERATION_REPLAY_CONFLICT"});
    }
    const rows=await prisma.$queryRaw<{state:string;appTracerRef:string}[]>`
      SELECT state,"appTracerRef" FROM "MobileOtaRelease" WHERE id=${releaseId}::uuid
    `;
    expect(rows).toEqual([{state:"READY",appTracerRef:input.appTracerRef}]);
  });
});
