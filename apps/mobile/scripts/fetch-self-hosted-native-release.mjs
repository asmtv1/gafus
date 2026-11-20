#!/usr/bin/env node
/** Resolve immutable, already approved native binary descriptor from our protected API. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const UUID=/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export function validateCiNativeDescriptor(value, { nativeId, environment, platform, runtime } = {}) {
  if (!value || value.id!==nativeId || value.verified!==true ||
      value.environment!==environment || value.platform!==platform ||
      !/^\d+\.\d+\.\d+$/.test(value.runtimeVersion ?? "") ||
      (runtime && value.runtimeVersion!==runtime) || value.appVersion!==value.runtimeVersion ||
      !/^https:\/\//.test(value.updateUrl) ||
      !/^[a-f\d]{64}$/.test(value.nativeFingerprint) ||
      !/^[a-f\d]{40}$/.test(value.sourceSha) ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(value.signingKeyId) ||
      typeof value.certificatePem!=="string")
    throw Error("UNVERIFIED_OR_INCOMPATIBLE_NATIVE_DESCRIPTOR");
  new crypto.X509Certificate(value.certificatePem);
  if (crypto.createHash("sha256").update(value.certificatePem).digest("hex")!==value.certificateSha256)
    throw Error("CI_NATIVE_CERTIFICATE_HASH_MISMATCH");
  return value;
}
export function trustedApiUrl(apiOrigin, nativeId) {
  if (!UUID.test(nativeId)) throw Error("INVALID_NATIVE_ID");
  const base = new URL(apiOrigin);
  if (base.protocol!=="https:" || base.pathname!=="/" || base.username || base.password || base.hash || base.search)
    throw Error("UNTRUSTED_OTA_CI_API_ORIGIN");
  return new URL(`/api/v1/internal/mobile-ota/native-releases/${nativeId}`, base).href;
}
async function main() {
  const [nativeId, environment, platform, runtime, targetDir]=process.argv.slice(2);
  if (!nativeId || !targetDir || !["preview","production"].includes(environment) ||
      !["ios","android"].includes(platform))
    throw Error("USAGE: nativeId environment platform runtime outputDir");
  if (environment!=="preview" && (process.env.CI!=="true" ||
      process.env.GAFUS_OTA_PRODUCTION_APPROVED!=="true"))
    throw Error("PRODUCTION_OTA_REQUIRES_PROTECTED_CI_APPROVAL");
  const token=process.env.MOBILE_OTA_CI_CALLBACK_TOKEN;
  if (!token || token.length<32) throw Error("MISSING_OTA_CI_TOKEN");
  const url=trustedApiUrl(process.env.MOBILE_OTA_API_ORIGIN, nativeId);
  const response=await fetch(url,{
    headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},
    cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw Error(`NATIVE_DESCR_READ_FAILED_${response.status}`);
  const value=await response.json();
  if (value.success!==true) throw Error("NATIVE_DESCRIPTOR_UNAVAILABLE");
  const native=validateCiNativeDescriptor(value.data,{nativeId,environment,platform,runtime});
  const output=path.resolve(targetDir);
  if (fs.existsSync(output) && fs.readdirSync(output).length) throw Error("NATIVE_OUTPUT_DIR_NOT_EMPTY");
  fs.mkdirSync(output,{recursive:true,mode:0o700});
  const descriptorFile=path.join(output,"native.json");
  const certificateFile=path.join(output,"native-cert.pem");
  fs.writeFileSync(descriptorFile,JSON.stringify(native,null,2),{mode:0o600,flag:"wx"});
  fs.writeFileSync(certificateFile,native.certificatePem,{mode:0o600,flag:"wx"});
  console.log(JSON.stringify({state:"VERIFIED_NATIVE_DESCRIPTOR_FETCHED",nativeId,
    descriptorFile,certificateFile,runtime:native.runtimeVersion,appVersion:native.appVersion,
    channel:native.channel,signingKeyId:native.signingKeyId,nativeFingerprint:native.nativeFingerprint}));
}
if (process.argv[1] && path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)) {
  main().catch(err=>{console.error(err instanceof Error?err.message:String(err));process.exitCode=1;});
}
