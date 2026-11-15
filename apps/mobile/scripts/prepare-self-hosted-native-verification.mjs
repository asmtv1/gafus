#!/usr/bin/env node
/** Hash a real IPA/APK/AAB and prepare a human-attested native QA request.
 * Never claims a device test or a distribution test automatically.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PREVIEW_SIGNING_KEY_ID} from './verify-ota-preview-native-trust.mjs';
import {PRODUCTION_SIGNING_KEY_ID} from './prepare-self-hosted-native-build.mjs';

const PREVIEW_CERT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../ota-public-certificates/gafus-preview-20261114.cert.txt');
const PRODUCTION_CERT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../ota-public-certificates/gafus-production-20261115.cert.txt');
const SHA40=/^[0-9a-f]{40}$/;
const SHA64=/^[0-9a-f]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OP_ID=/^[A-Za-z0-9_-]{16,120}$/;
function required(ok,code){if(!ok)throw Error(`OTA_NATIVE_VERIFICATION_${code}`);}
export async function hashNativePackage(filename,platform) {
  const absolute=path.resolve(filename);
  const stat=fs.lstatSync(absolute);
  required(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>=1024*1024,
    'PACKAGE_MISSING_OR_TOO_SMALL');
  const ext=path.extname(absolute).toLowerCase();
  required(platform==='ios'?ext==='.ipa':platform==='android'&&['.apk','.aab'].includes(ext),
    'PACKAGE_PLATFORM_EXTENSION_MISMATCH');
  const magic=Buffer.alloc(4);
  const fd=fs.openSync(absolute,'r');
  try{fs.readSync(fd,magic,0,4,0);}finally{fs.closeSync(fd);}
  required(magic[0]===0x50&&magic[1]===0x4b&&magic[2]===0x03&&magic[3]===0x04,
    'INVALID_ZIP_CONTAINER');
  const sha=crypto.createHash('sha256');
  for await(const block of fs.createReadStream(absolute))sha.update(block);
  // Reject files which changed while being hashed. The result alone is not
  // a substitute for checking signatures/entitlements and device installation.
  const end=fs.lstatSync(absolute);
  required(end.isFile()&&!end.isSymbolicLink()&&end.size===stat.size&&
    end.mtimeMs===stat.mtimeMs&&end.ino===stat.ino,'PACKAGE_CHANGED_DURING_HASH');
  return sha.digest('hex');
}
export async function prepareNativeVerification({native,evidence,packageFile}) {
  required(native&&UUID.test(native.id)&&native.verified===false&&
    ['preview','production'].includes(native.environment)&&
    native.channel===native.environment&&
    ['ios','android'].includes(native.platform)&&
    native.signingKeyId===(native.environment==='production'?PRODUCTION_SIGNING_KEY_ID:PREVIEW_SIGNING_KEY_ID)&&
    native.bundleId==='ru.gafus.app'&&native.appId==='gafus'&&
    native.runtimeVersion===native.appVersion&&
    /^\d+\.\d+\.\d+$/.test(native.appVersion)&&
    (native.environment!=='production'||native.appVersion==='1.7.5')&&
    SHA40.test(native.sourceSha)&&SHA64.test(native.nativeFingerprint),
    'UNTRUSTED_NATIVE_DESCRIPTOR');
  const cert=fs.readFileSync(native.environment==='production'?PRODUCTION_CERT:PREVIEW_CERT,'utf8');
  required(native.certificatePem===cert&&
    native.certificateSha256===crypto.createHash('sha256').update(cert).digest('hex'),
    'UNPINNED_NATIVE_CERTIFICATE');
  let updateOrigin;
  try {updateOrigin=new URL(native.updateUrl);}catch{required(false,'UNTRUSTED_NATIVE_MANIFEST_ORIGIN');}
  required(updateOrigin.protocol==='https:'&&
    (native.environment==='production'?updateOrigin.hostname==='gafus.ru':
      updateOrigin.hostname.endsWith('.gafus.ru')&&updateOrigin.hostname!=='api.gafus.ru')&&
    !updateOrigin.username&&!updateOrigin.password&&!updateOrigin.port&&
    updateOrigin.pathname==='/ota/manifest'&&!updateOrigin.search&&!updateOrigin.hash,
    'UNTRUSTED_NATIVE_MANIFEST_ORIGIN');
  required(evidence&&evidence.physicalDeviceVerified===true&&
    evidence.distributionVerified===true&&OP_ID.test(evidence.operationId??'')&&
    typeof evidence.reason==='string'&&evidence.reason.trim().length>=16&&
    evidence.reason.length<=512&&typeof evidence.reference==='string'&&
    evidence.reference.length>=4&&evidence.reference.length<=256,
    'EXPLICIT_HUMAN_QA_EVIDENCE_REQUIRED');
  const hash=await hashNativePackage(packageFile,native.platform);
  return {operationId:evidence.operationId,action:'VERIFY',reason:evidence.reason.trim(),
    evidence:{nativeArtifactSha256:hash,physicalDeviceVerified:true,
      distributionVerified:true,reference:evidence.reference}};
}
async function main(){
  const [descriptorFile,packageFile,evidenceFile,outputFile]=process.argv.slice(2);
  if(process.argv.length!==6)
    throw Error('USAGE: <native-descriptor.json> <verified-IPA-or-APK-or-AAB> <human-qa-evidence.json> <out.json>');
  const result=await prepareNativeVerification({
    native:JSON.parse(fs.readFileSync(descriptorFile,'utf8')),
    packageFile,evidence:JSON.parse(fs.readFileSync(evidenceFile,'utf8')),
  });
  const output=path.resolve(outputFile);
  required(!fs.existsSync(output),'OUTPUT_ALREADY_EXISTS');
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({state:'NATIVE_QA_ATTESTATION_PREPARED_FOR_ADMIN_REVIEW',
    nativeArtifactSha256:result.evidence.nativeArtifactSha256,output}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
}
