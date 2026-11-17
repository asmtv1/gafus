#!/usr/bin/env node
/** Offline two-phase native build input for a signed self-hosted preview runtime.
 *
 * Phase 1: prepare a fingerprinted candidate while git is clean. Register the
 * candidate using the ADMIN API (no binary SHA exists yet).
 * Phase 2: finalize using the returned ID, without changing any native input.
 * Neither phase creates credentials, registers releases, builds or publishes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {computeNativeSourceFingerprint} from './native-source-fingerprint.mjs';
import {PREVIEW_SIGNING_KEY_ID} from './verify-ota-preview-native-trust.mjs';
import {assertExpoOtaCodeSigningCertificate} from './verify-expo-ota-code-signing-cert.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const PINNED_CERT=path.join(ROOT,
  'apps/mobile/ota-public-certificates/gafus-preview-20261114.cert.txt');
export const PRODUCTION_SIGNING_KEY_ID='gafus-production-20261115';
const PRODUCTION_CERT=path.join(ROOT,
  'apps/mobile/ota-public-certificates/gafus-production-20261115.cert.txt');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA40=/^[0-9a-f]{40}$/;
const SHA64=/^[0-9a-f]{64}$/;
const OP_ID=/^[A-Za-z0-9_-]{16,120}$/;
function requireCondition(ok,error){if(!ok)throw Error(`OTA_PREVIEW_BUILD_${error}`);}
function git(root,args){return execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10_000}).trim();}
export function assertCleanNativeSnapshot(root,sourceSha) {
  requireCondition(SHA40.test(sourceSha),'INVALID_SOURCE_SHA');
  requireCondition(git(root,['rev-parse','HEAD'])===sourceSha,'SOURCE_SHA_MISMATCH');
  requireCondition(!git(root,['status','--porcelain','--untracked-files=all']),'DIRTY_CHECKOUT');
}
function validateNativeOrigin(origin,environment) {
  let url;try{url=new URL(origin);}catch{throw Error('OTA_PREVIEW_BUILD_INVALID_API_ORIGIN');}
  requireCondition(url.protocol==='https:' && !url.username && !url.password &&
    !url.port && url.pathname==='/' && !url.search && !url.hash &&
    (environment==='production' ? url.origin==='https://gafus.ru' :
      url.hostname.endsWith('.gafus.ru') &&
      !['api.gafus.ru','www.gafus.ru'].includes(url.hostname)),
    'API_ORIGIN_UNTRUSTED');
  return url.origin;
}
export function prepareNativeCandidate({root,config,certificatePem}) {
  const p=config;
  requireCondition(p && typeof p==='object' && !Array.isArray(p),'INVALID_CONFIG');
  const environment=p.environment??'preview';
  requireCondition(['preview','production'].includes(environment),'INVALID_ENVIRONMENT');
  requireCondition(['ios','android'].includes(p.platform),'INVALID_PLATFORM');
  requireCondition((p.platform==='ios' && ['internal','testflight',
      ...(environment==='production'?['app-store']:[])].includes(p.distribution)) ||
    (p.platform==='android' && ['internal',
      ...(environment==='production'?['store']:[])].includes(p.distribution)),'INVALID_DISTRIBUTION');
  requireCondition(/^\d{1,20}$/.test(p.buildNumber??''),'INVALID_BUILD_NUMBER');
  requireCondition(OP_ID.test(p.operationId??''),'INVALID_OPERATION_ID');
  requireCondition(typeof p.ciRunId==='string'&&p.ciRunId.length>=2&&p.ciRunId.length<=100,
    'INVALID_BUILD_PROVENANCE');
  requireCondition(typeof p.buildLogRef==='string'&&p.buildLogRef.length>=2&&p.buildLogRef.length<=256,
    'INVALID_BUILD_PROVENANCE');
  const apiOrigin=validateNativeOrigin(p.apiOrigin,environment);
  assertCleanNativeSnapshot(root,p.sourceSha);
  const app=JSON.parse(fs.readFileSync(path.join(root,'apps/mobile/app.json'),'utf8')).expo;
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'apps/mobile/package.json'),'utf8'));
  const runtime=app.version;
  requireCondition(/^\d+\.\d+\.\d+$/.test(runtime)&&runtime!=='1.7.4'&&
    (environment!=='production'||runtime==='1.7.5')&&
    runtime===pkg.version&&app.runtimeVersion?.policy==='appVersion',
    'APP_RUNTIME_INCOMPATIBLE');
  let cert;try{cert=new crypto.X509Certificate(certificatePem);}catch{throw Error('OTA_PREVIEW_BUILD_BAD_CERTIFICATE');}
  requireCondition(cert.publicKey.asymmetricKeyType==='rsa'&&
    (cert.publicKey.asymmetricKeyDetails?.modulusLength??0)>=2048&&
    Date.parse(cert.validTo)>Date.now()+30*86400_000,'CERTIFICATE_UNUSABLE');
  if(environment==='production') {
    try{assertExpoOtaCodeSigningCertificate(certificatePem);}
    catch{throw Error('OTA_PREVIEW_BUILD_CERTIFICATE_NOT_EXPO_CODE_SIGNING');}
  }
  const certificateSha256=crypto.createHash('sha256').update(certificatePem).digest('hex');
  const channel=environment;
  const signingKeyId=environment==='production'?PRODUCTION_SIGNING_KEY_ID:PREVIEW_SIGNING_KEY_ID;
  const profile={platform:p.platform,environment,channel,
    runtimeVersion:runtime,appVersion:runtime,signingKeyId,
    certificateSha256,updateUrl:`${apiOrigin}/ota/manifest`};
  const {fingerprint,fileCount}=computeNativeSourceFingerprint(root,profile);
  const candidate={operationId:p.operationId,platform:p.platform,environment,
    distribution:p.distribution,bundleId:'ru.gafus.app',appVersion:runtime,
    buildNumber:p.buildNumber,runtimeVersion:runtime,channel,
    updateUrl:profile.updateUrl,signingKeyId,
    certificatePem,nativeFingerprint:fingerprint,sourceSha:p.sourceSha,
    provenance:{ciRunId:p.ciRunId,buildLogRef:p.buildLogRef}};
  return {candidate,fileCount};
}
export function finalizeNativeBuild({root,candidate,nativeId,certificatePem}) {
  requireCondition(UUID.test(nativeId),'INVALID_NATIVE_ID');
  requireCondition(candidate&&typeof candidate==='object','INVALID_CANDIDATE');
  const environment=candidate.environment;
  const keyId=environment==='production'?PRODUCTION_SIGNING_KEY_ID:PREVIEW_SIGNING_KEY_ID;
  requireCondition(['preview','production'].includes(environment)&&
    candidate.channel===environment&&candidate.signingKeyId===keyId&&
    candidate.certificatePem===certificatePem&&
    candidate.certificateSha256===undefined&&
    candidate.provenance?.nativeArtifactSha256===undefined,
    'UNTRUSTED_CANDIDATE');
  assertCleanNativeSnapshot(root,candidate.sourceSha);
  const rechecked=prepareNativeCandidate({root,certificatePem,config:{
    environment,platform:candidate.platform,distribution:candidate.distribution,
    buildNumber:candidate.buildNumber,operationId:candidate.operationId,
    ciRunId:candidate.provenance?.ciRunId,
    buildLogRef:candidate.provenance?.buildLogRef,
    apiOrigin:new URL(candidate.updateUrl).origin,sourceSha:candidate.sourceSha,
  }}).candidate;
  requireCondition(JSON.stringify(rechecked)===JSON.stringify(candidate),'CANDIDATE_CHANGED');
  const hash=crypto.createHash('sha256').update(certificatePem).digest('hex');
  requireCondition(SHA64.test(hash),'CERTIFICATE_HASH_INVALID');
  return {id:nativeId,appId:'gafus',platform:candidate.platform,
    environment,distribution:candidate.distribution,
    bundleId:candidate.bundleId,buildNumber:candidate.buildNumber,
    appVersion:candidate.appVersion,runtimeVersion:candidate.runtimeVersion,
    channel:environment,updateUrl:candidate.updateUrl,
    signingKeyId:keyId,certificatePem,
    certificateSha256:hash,nativeFingerprint:candidate.nativeFingerprint,
    sourceSha:candidate.sourceSha,verified:false};
}
function writeJson(filename,value) {
  const output=path.resolve(filename);
  requireCondition(!fs.existsSync(output),'OUTPUT_ALREADY_EXISTS');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
}
function main(){
  const [action,input,out,id]=process.argv.slice(2);
  if(action==='prepare'&&input&&out&&!id){
    const config=JSON.parse(fs.readFileSync(input,'utf8'));
    const certificatePem=fs.readFileSync(config.environment==='production'?PRODUCTION_CERT:PINNED_CERT,'utf8');
    const result=prepareNativeCandidate({root:ROOT,config,certificatePem});
    writeJson(out,result.candidate);
    console.log(JSON.stringify({status:'NATIVE_CANDIDATE_READY_FOR_ADMIN_REGISTRATION',
      fileCount:result.fileCount,runtime:result.candidate.runtimeVersion,
      fingerprint:result.candidate.nativeFingerprint,output:path.resolve(out)}));
  }else if(action==='finalize'&&input&&out&&id){
    const candidate=JSON.parse(fs.readFileSync(input,'utf8'));
    const descriptor=finalizeNativeBuild({root:ROOT,candidate,nativeId:id,
      certificatePem:fs.readFileSync(candidate.environment==='production'?PRODUCTION_CERT:PINNED_CERT,'utf8')});
    writeJson(out,descriptor);
    console.log(JSON.stringify({status:'UNVERIFIED_NATIVE_BUILD_DESCRIPTOR_READY',
      nativeReleaseId:id,output:path.resolve(out)}));
  }else throw Error('USAGE: prepare <config.json> <candidate.json> | finalize <candidate.json> <native.json> <registered-native-id>');
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))) {
  try{main();}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
