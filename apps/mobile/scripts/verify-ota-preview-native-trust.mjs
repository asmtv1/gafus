#!/usr/bin/env node
/** Fail-closed preview trust pin: the OTA signer, native binary, and preview API must agree. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const PREVIEW_CERT_PATH=path.join(REPO_ROOT,
  'apps/mobile/ota-public-certificates/gafus-preview-20261114.cert.txt');
export const PREVIEW_SIGNING_KEY_ID='gafus-preview-20261114';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA40=/^[a-f0-9]{40}$/;
const SHA64=/^[a-f0-9]{64}$/;

function fail(name) {throw Error(`OTA_PREVIEW_TRUST_${name}`);}
function cleanOrigin(value) {
  let url;
  try {url=new URL(value);}catch{fail('API_ORIGIN_INVALID');}
  if(url.protocol!=='https:' || url.pathname!=='/' || url.search || url.hash ||
     url.username || url.password || url.port ||
     !url.hostname.endsWith('.gafus.ru') ||
     ['api.gafus.ru','www.gafus.ru'].includes(url.hostname))
    fail('API_ORIGIN_UNTRUSTED');
  return url.origin;
}
export function verifyPreviewNativeTrust({native,sourceSha,runtime,platform,
  apiOrigin,chatOrigin,certificatePem,now=Date.now()}) {
  if(!native || !UUID.test(native.id) || native.verified!==true ||
     native.appId!=='gafus' || native.bundleId!=='ru.gafus.app' ||
     native.environment!=='preview' || native.channel!=='preview' ||
     native.platform!==platform || !['ios','android'].includes(platform) ||
     native.runtimeVersion!==runtime || native.appVersion!==runtime ||
     !/^\d+\.\d+\.\d+$/.test(runtime) ||
     !SHA40.test(sourceSha) || native.sourceSha!==sourceSha ||
     !SHA64.test(native.nativeFingerprint))
    fail('NATIVE_RELEASE_MISMATCH');
  const canonicalOrigin=cleanOrigin(apiOrigin);
  if(cleanOrigin(chatOrigin)!==canonicalOrigin)fail('CHAT_API_ORIGIN_MISMATCH');
  if(native.updateUrl!==`${canonicalOrigin}/ota/manifest`)
    fail('MANIFEST_ORIGIN_MISMATCH');
  if(native.signingKeyId!==PREVIEW_SIGNING_KEY_ID)
    fail('SIGNING_KEY_ID_UNPINNED');
  if(typeof certificatePem!=='string' ||
     native.certificatePem!==certificatePem ||
     crypto.createHash('sha256').update(certificatePem).digest('hex')!==native.certificateSha256)
    fail('CERTIFICATE_NOT_PINNED');
  let cert;
  try{cert=new crypto.X509Certificate(certificatePem);}catch{fail('CERTIFICATE_INVALID');}
  if(cert.publicKey.asymmetricKeyType!=='rsa' ||
     (cert.publicKey.asymmetricKeyDetails?.modulusLength??0)<2048)
    fail('CERTIFICATE_WEAK');
  if(Date.parse(cert.validFrom)>now || Date.parse(cert.validTo)<now+30*86400_000)
    fail('CERTIFICATE_EXPIRING');
  return {state:'OTA_PREVIEW_NATIVE_TRUST_PINNED',platform,runtime,
    signingKeyId:PREVIEW_SIGNING_KEY_ID,apiOrigin:canonicalOrigin,
    certificateSha256:native.certificateSha256,nativeReleaseId:native.id};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))) {
  try {
    if(process.argv.length!==3)fail('USAGE_DESCRIPTOR_REQUIRED');
    const native=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
    console.log(JSON.stringify(verifyPreviewNativeTrust({native,
      sourceSha:process.env.OTA_SOURCE_SHA,runtime:process.env.OTA_RUNTIME,
      platform:process.env.OTA_PLATFORM,
      apiOrigin:process.env.MOBILE_OTA_API_ORIGIN,
      chatOrigin:process.env.EXPO_PUBLIC_CHAT2_API_ORIGIN,
      certificatePem:fs.readFileSync(PREVIEW_CERT_PATH,'utf8')})));
  }catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
