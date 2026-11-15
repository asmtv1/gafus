#!/usr/bin/env node
/** Freeze the exact signing trust anchor, binary, source and runtime for production OTA. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PRODUCTION_SIGNING_KEY_ID} from './prepare-self-hosted-native-build.mjs';

export const PRODUCTION_CERT_PATH=path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../ota-public-certificates/gafus-production-20261115.cert.txt');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA40=/^[a-f0-9]{40}$/;
const SHA64=/^[a-f0-9]{64}$/;
function fail(message){throw Error(`OTA_PRODUCTION_TRUST_${message}`);}
export function verifyProductionNativeTrust({native,sourceSha,runtime,platform,certificatePem,now=Date.now()}){
  if(!native || !UUID.test(native.id) || native.verified!==true ||
     native.appId!=='gafus' || native.bundleId!=='ru.gafus.app' ||
     native.environment!=='production' || native.channel!=='production' ||
     native.platform!==platform || !['android','ios'].includes(platform) ||
     native.runtimeVersion!==runtime || native.appVersion!==runtime || runtime!=='1.7.5' ||
     !SHA40.test(sourceSha) || !SHA40.test(native.sourceSha) ||
     !SHA64.test(native.nativeFingerprint) ||
     native.updateUrl!=='https://gafus.ru/ota/manifest' ||
     native.signingKeyId!==PRODUCTION_SIGNING_KEY_ID)
    fail('NATIVE_SOURCE_RUNTIME_OR_ENDPOINT_MISMATCH');
  const pinned=fs.readFileSync(PRODUCTION_CERT_PATH,'utf8');
  if(certificatePem!==pinned || native.certificatePem!==pinned ||
     crypto.createHash('sha256').update(pinned).digest('hex')!==native.certificateSha256)
    fail('CERTIFICATE_NOT_PINNED');
  let cert;try{cert=new crypto.X509Certificate(pinned);}catch{fail('INVALID_CERTIFICATE');}
  if(cert.publicKey.asymmetricKeyType!=='rsa' ||
     (cert.publicKey.asymmetricKeyDetails?.modulusLength??0)<3072 ||
     Date.parse(cert.validFrom)>now || Date.parse(cert.validTo)<now+30*86400_000)
    fail('CERTIFICATE_EXPIRED_OR_WEAK');
  return {state:'OTA_PRODUCTION_NATIVE_TRUST_PINNED',nativeReleaseId:native.id,
    platform,runtime,signingKeyId:PRODUCTION_SIGNING_KEY_ID,
    certificateSha256:native.certificateSha256};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{
    if(process.argv.length!==3)fail('USAGE_DESCRIPTOR_REQUIRED');
    const native=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
    console.log(JSON.stringify(verifyProductionNativeTrust({native,
      sourceSha:process.env.OTA_SOURCE_SHA,runtime:process.env.OTA_RUNTIME,
      platform:process.env.OTA_PLATFORM,
      certificatePem:fs.readFileSync(PRODUCTION_CERT_PATH,'utf8')})));
  }catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
