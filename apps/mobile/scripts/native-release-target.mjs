/** Descriptor-bound local build target; no OTA publication or store upload. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {applyNativeSelfHostedProfile} from './self-hosted-native-profile.cjs';
import {computeNativeSourceFingerprint} from './native-source-fingerprint.mjs';
import {validateNativeReleaseContract} from './native-release-contract.mjs';
import {assertEasArchiveRules} from './native-eas-archive.mjs';
export const mobileRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const semver=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const sha40=/^[a-f0-9]{40}$/;
const sha64=/^[a-f0-9]{64}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const required=(condition,code)=>{if(!condition)throw Error('NATIVE_RELEASE_'+code);};
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:20000}).trim();
export function validateRegisteredTarget(d,{platform,distribution,appVersion,sourceSha,certificatePem,environment}) {
  required(d&&typeof d==='object'&&!Array.isArray(d)&&uuid.test(d.id??'')&&d.appId==='gafus'&&d.bundleId==='ru.gafus.app','DESCRIPTOR_ID_INVALID');
  required(['ios','android'].includes(platform)&&d.platform===platform,'PLATFORM_MISMATCH');
  const allowed=platform==='ios'?['internal','testflight','app-store']:['internal','google-play','rustore'];
  required(allowed.includes(distribution)&&d.distribution===distribution,'DISTRIBUTION_MISMATCH');
  required(['production','preview'].includes(environment)&&d.environment===environment&&d.channel===environment,'ENVIRONMENT_MISMATCH');
  required(environment==='production'||['internal','testflight'].includes(distribution),'STORE_REQUIRES_PRODUCTION');
  required(semver.test(appVersion??'')&&d.appVersion===appVersion&&d.runtimeVersion===appVersion,'VERSION_RUNTIME_MISMATCH');
  required(typeof d.buildNumber==='string'&&/^[1-9]\d{0,9}$/.test(d.buildNumber)&&Number(d.buildNumber)<=2100000000,'BUILD_NUMBER_INVALID');
  required(sha40.test(sourceSha??'')&&d.sourceSha===sourceSha&&sha64.test(d.nativeFingerprint??''),'SOURCE_OR_FINGERPRINT_INVALID');
  required(typeof d.signingKeyId==='string'&&/^[A-Za-z0-9_.-]{1,100}$/.test(d.signingKeyId),'SIGNING_KEY_INVALID');
  required(d.verified===false,'UNVERIFIED_REGISTERED_CANDIDATE_REQUIRED');
  required(typeof certificatePem==='string'&&d.certificatePem===certificatePem&&
    sha64.test(d.certificateSha256??'')&&crypto.createHash('sha256').update(certificatePem).digest('hex')===d.certificateSha256,'CERTIFICATE_MISMATCH');
  let url;try{url=new URL(d.updateUrl);}catch{throw Error('NATIVE_RELEASE_ENDPOINT_INVALID');}
  required(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash&&url.pathname==='/ota/manifest'&&
    (environment==='production'?url.hostname==='gafus.ru':url.hostname.endsWith('.gafus.ru')&&!['api.gafus.ru','www.gafus.ru'].includes(url.hostname)),'ENDPOINT_INVALID');
  return d;
}
export function loadRegisteredTarget({platform,distribution,env=process.env,root=mobileRoot,requirePushed=false}) {
  const repo=path.resolve(root,'../..');
  required(!!env.GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR,'EXPLICIT_DESCRIPTOR_REQUIRED');
  const descriptorFile=path.resolve(root,env.GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR);
  const certificatePath=path.resolve(root,env.GAFUS_OTA_NATIVE_CERTIFICATE||'.ota-certs/native.pem');
  const d=JSON.parse(fs.readFileSync(descriptorFile,'utf8'));
  const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')).expo;
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const eas=JSON.parse(fs.readFileSync(path.join(root,'eas.json'),'utf8'));
  const environment=env.APP_ENV||d.environment;
  const sourceSha=git(repo,['rev-parse','HEAD']);
  const certificatePem=fs.readFileSync(certificatePath,'utf8');
  validateRegisteredTarget(d,{platform,distribution,appVersion:app.version,sourceSha,certificatePem,environment});
  required(!git(repo,['status','--porcelain','--untracked-files=all']),'CLEAN_COMMITTED_SOURCE_REQUIRED');
  if(requirePushed){
    required(git(repo,['branch','--show-current'])==='main','MAIN_REQUIRED');
    required(git(repo,['ls-remote','--exit-code','origin','refs/heads/main']).split(/\s+/)[0]===sourceSha,'PUSH_TO_MAIN_FIRST');
  }
  const errors=validateNativeReleaseContract({expo:app,mobilePackage:pkg,eas,env});
  required(!errors.length,'CONTRACT_INVALID:'+errors.join(','));
  required(computeNativeSourceFingerprint(repo,d).fingerprint===d.nativeFingerprint,'REGISTERED_FINGERPRINT_CHANGED');
  const store=distribution!=='internal';
  if(store) {
    assertEasArchiveRules();
    required(descriptorFile===path.join(root,'.ota-certs',platform+'-store-native.json')&&
      certificatePath===path.join(root,'.ota-certs','native.pem'),'EAS_STAGED_TRUST_PATH_REQUIRED');
  }
  const buildEnv={...env,APP_ENV:environment,GAFUS_OTA_TRANSPORT:'self-hosted',
    GAFUS_OTA_TARGET_PLATFORM:platform,
    GAFUS_OTA_LOCAL_DEVICE_TEST:!store&&environment==='production'?'true':'false',
    GAFUS_OTA_LOCAL_STORE_BUILD:store&&environment==='production'?'true':'false',
    GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR:store?'.ota-certs/'+platform+'-store-native.json':descriptorFile,
    GAFUS_OTA_NATIVE_CERTIFICATE:store?'.ota-certs/native.pem':certificatePath,
    EXPO_PUBLIC_APP_VERSION:d.appVersion,EXPO_PUBLIC_CHAT2_API_ORIGIN:env.EXPO_PUBLIC_CHAT2_API_ORIGIN||'https://api.gafus.ru'};
  const configured=applyNativeSelfHostedProfile(app,{environment:buildEnv,appRoot:root});
  required(configured.updates?.url===d.updateUrl&&configured.updates?.checkAutomatically==='NEVER'&&
    configured.extra?.otaNativeReleaseId===d.id&&configured.extra?.otaNativeFingerprint===d.nativeFingerprint&&
    (platform==='ios'?configured.ios?.buildNumber===d.buildNumber:configured.android?.versionCode===Number(d.buildNumber)),
    'EMBEDDED_CONFIG_MISMATCH');
  return {...d,descriptorFile,certificatePath,buildEnv};
}
