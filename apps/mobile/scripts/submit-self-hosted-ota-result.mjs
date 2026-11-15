#!/usr/bin/env node
/** Submit the independently signed, S3/CDN-verified preview result to guarded API. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SHA=/^[a-f0-9]{64}$/;
const HASH=/^[a-f0-9]{40}$/;
const UUID=/^[a-f0-9-]{36}$/i;
const sha=(buf)=>crypto.createHash("sha256").update(buf).digest("hex");
function required(name) {
  const value=process.env[name];
  if (!value) throw Error(`MISSING_CI_CONFIG_${name}`);
  return value;
}
export function prepareVerifiedCiResult({directory,ciRunId,operationId,buildAttempt=1,
  symbolsRef,checks}) {
  const info=JSON.parse(fs.readFileSync(path.join(directory,"release-metadata.json"),"utf8"));
  const proof=JSON.parse(fs.readFileSync(path.join(directory,"delivery-evidence.json"),"utf8"));
  const bytes=fs.readFileSync(path.join(directory,"manifest.json"));
  if (sha(bytes)!==info.manifestSha256 || info.environment!=="preview" && info.environment!=="production" ||
      proof.environment!==info.environment || proof.updateId!==info.updateId ||
      proof.state!=="UPLOAD_VERIFIED_NOT_PUBLISHED" || !UUID.test(info.nativeReleaseId) ||
      !HASH.test(info.sourceSha) || !UUID.test(info.updateId))
    throw Error("OTA_CI_EVIDENCE_INCONSISTENT");
  if (!Array.isArray(info.inventory) || !Array.isArray(proof.report) ||
      info.inventory.length!==proof.report.length || info.inventory.length===0)
    throw Error("OTA_CI_ASSET_EVIDENCE_MISSING");
  const seen=new Set();
  const artifacts=info.inventory.map(a=>{
    const key=`${proof.prefix}/${a.immutableFile}`;
    const receipt=proof.report.find(r=>r.key===key);
    if (!receipt || receipt.sha256!==a.sha256 || receipt.size!==a.sizeBytes ||
        receipt.s3Verified!==true || receipt.cdnVerified!==true || seen.has(key) ||
        !SHA.test(a.sha256) || !a.immutableFile.startsWith(a.sha256+'.'))
      throw Error("OTA_CI_ASSET_RECEIPT_MISMATCH");
    seen.add(key);
    const manifest=JSON.parse(bytes.toString("utf8"));
    const url=[manifest.launchAsset,...manifest.assets].find(x=>x.url?.endsWith('/'+a.immutableFile))?.url;
    if (!url || !url.startsWith("https://")) throw Error("OTA_CI_ASSET_URL_MISMATCH");
    return {key:a.immutableFile,immutableUrl:url,sha256:a.sha256,
      mimeType:a.contentType,sizeBytes:a.sizeBytes,cdnVerified:true,s3Verified:true};
  });
  if (!Number.isSafeInteger(buildAttempt) || buildAttempt<1 || !ciRunId || !operationId || !symbolsRef ||
      !checks || ![checks.unit,checks.mobileTypecheck,checks.nativeCompatibility].every(x=>x===true) ||
      !(checks.privateSymbols===true && /^symbols-s3:[a-f0-9]{64}$/.test(symbolsRef)) ||
      (info.platform==='ios' && checks.iosPaymentGraph!==true))
    throw Error("OTA_CI_REQUIRED_CHECKS_MISSING");
  return {operationId,nativeReleaseId:info.nativeReleaseId,updateId:info.updateId,
    sourceSha:info.sourceSha,revision:info.revision,buildAttempt,ciRunId,
    manifestBase64:bytes.toString("base64"),signatureHeader:info.signatureHeader,
    artifacts,checks,symbolsRef};
}
async function main() {
  if (process.argv.length!==3) throw Error("USAGE: submit-self-hosted-ota-result.mjs <artifact-dir>");
  const directory=path.resolve(process.argv[2]);
  const info=JSON.parse(fs.readFileSync(path.join(directory,"release-metadata.json"),"utf8"));
  if (info.environment==='production' && (process.env.CI!=="true" ||
      process.env.GAFUS_OTA_PRODUCTION_APPROVED!=="true"))
    throw Error("PRODUCTION_OTA_REQUIRES_PROTECTED_CI_APPROVAL");
  const payload=prepareVerifiedCiResult({directory,
    ciRunId:required("GAFUS_OTA_CI_RUN_ID"), operationId:required("GAFUS_OTA_OPERATION_ID"),
    buildAttempt:Number(process.env.GAFUS_OTA_BUILD_ATTEMPT||"1"),
    symbolsRef:required("GAFUS_OTA_SYMBOLS_REF"),
    checks:{unit:true,mobileTypecheck:true,nativeCompatibility:true,
      iosPaymentGraph:info.platform==='ios',
      privateSymbols:true},
  });
  const origin=new URL(required("MOBILE_OTA_API_ORIGIN"));
  if (origin.protocol!=="https:" || origin.pathname!=="/" || origin.search || origin.hash)
    throw Error("OTA_CI_UNTRUSTED_API_ORIGIN");
  const callbackToken=required("MOBILE_OTA_CI_CALLBACK_TOKEN");
  if (callbackToken.length<32) throw Error("OTA_CI_TOKEN_TOO_SHORT");
  const response=await fetch(new URL("/api/v1/internal/mobile-ota/ci-complete",origin),{
    method:"POST",headers:{Authorization:`Bearer ${callbackToken}`,"Content-Type":"application/json"},
    body:JSON.stringify(payload),redirect:"error",cache:"no-store",signal:AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw Error(`OTA_CI_RESULT_REJECTED_${response.status}`);
  const data=await response.json();
  if (data.success!==true || !UUID.test(data.data?.releaseId)) throw Error("OTA_CI_RESULT_NOT_ACKNOWLEDGED");
  console.log(JSON.stringify({state:"READY_UNPUBLISHED",releaseId:data.data.releaseId,
    replayed:Boolean(data.data.replayed),updateId:info.updateId}));
}
if (process.argv[1] && path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)) {
  main().catch(err=>{console.error(err instanceof Error?err.message:String(err));process.exitCode=1;});
}
