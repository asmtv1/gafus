#!/usr/bin/env node
/** Build a Store-distribution iOS 1.7.5 IPA with our registered, signed OTA trust.
 * No command in this file publishes OTA, uploads/submits IPA or changes EAS remote versions.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareNativeCandidate,finalizeNativeBuild} from './prepare-self-hosted-native-build.mjs';
import {computeNativeSourceFingerprint} from './native-source-fingerprint.mjs';
import {assertGeneratedNativeOta} from './build-ota-175-local.mjs';
import {verifyIpa as sharedVerifyIpa,verifyAppleStoreProvisioningProfile} from './native-ios-store-artifact.mjs';
export {verifyAppleStoreProvisioningProfile};
export function verifyIpa(ipa,d,options){
  check(d.appVersion==='1.7.5'&&d.runtimeVersion==='1.7.5','REGISTERED_DESCRIPTOR_INVALID');
  return sharedVerifyIpa(ipa,d,options);
}
import {applyNativeSelfHostedProfile} from './self-hosted-native-profile.cjs';
import {assertEasArchiveRules,expectedEasIgnore} from './native-eas-archive.mjs';
export {expectedEasIgnore};

const mobile=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(mobile,'../..');
const cert=path.join(mobile,'ota-public-certificates/gafus-production-20261115.cert.txt');
const stagedCert=path.join(mobile,'.ota-certs/native.pem');
const stagedDescriptor=path.join(mobile,'.ota-certs/ios-store-native.json');
const base=path.join(os.homedir(),'.config/gafus/ota/store-ios-175');
const profileName='ota-175-ios-store';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(code)=>{throw Error(`OTA_175_IOS_STORE_${code}`);};
const check=(ok,code)=>{if(!ok)fail(code);};
const git=(args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:20000}).trim();
const sha=()=>git(['rev-parse','HEAD']);
const currentDir=()=>path.join(base,sha());
const descriptorPath=()=>path.join(currentDir(),'ios-native.json');
const candidatePath=()=>path.join(currentDir(),'ios-candidate.json');
const writeOnce=(p,content)=>{fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});fs.writeFileSync(p,JSON.stringify(content,null,2)+'\n',{flag:'wx',mode:0o600});};

export function validateStoreProfile(eas,app){
  const p=eas.build?.[profileName];
  check(eas.cli?.appVersionSource==='remote','EAS_REMOTE_VERSION_SOURCE_REQUIRED');
  check(p?.channel==='production'&&p?.environment==='production'&&
    p?.distribution==='store'&&p?.autoIncrement===false&&p?.ios?.simulator===false,
    'STORE_EAS_PROFILE_INVALID');
  const e=p.env;
  check(e?.GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR==='.ota-certs/ios-store-native.json'&&
    e?.GAFUS_OTA_NATIVE_CERTIFICATE==='.ota-certs/native.pem','EAS_ARCHIVE_DESCRIPTOR_PATH_INVALID');
  check(e?.APP_ENV==='production'&&e.GAFUS_OTA_TRANSPORT==='self-hosted'&&
    e.GAFUS_OTA_LOCAL_STORE_BUILD==='true'&&e.GAFUS_OTA_LOCAL_DEVICE_TEST!== 'true'&&
    e.GAFUS_OTA_TARGET_PLATFORM==='ios'&&e.EXPO_PUBLIC_APP_VERSION==='1.7.5'&&e.EXPO_PUBLIC_ENABLE_TRACER==='false'&&
    e.EXPO_PUBLIC_API_BASE_URL==='https://api.gafus.ru'&&
    e.EXPO_PUBLIC_CHAT2_API_ORIGIN==='https://api.gafus.ru','STORE_ENV_INVALID');
  for(const key of ['EXPO_PUBLIC_YM_MOBILE_ENABLED'])
    check(e[key]===eas.build?.production?.env?.[key],'STORE_PRODUCTION_AUTH_OR_ADS_ENV_DRIFT');
  check(app.version==='1.7.5'&&app.runtimeVersion?.policy==='appVersion'&&
    app.ios?.bundleIdentifier==='ru.gafus.app','STORE_RUNTIME_OR_BUNDLE_INVALID');
  return p;
}

export function validateStoreDescriptor(d,committedSha,certificate){
  check(d?.id&&UUID.test(d.id)&&d.appId==='gafus'&&d.platform==='ios'&&
    d.distribution==='app-store'&&d.environment==='production'&&d.channel==='production'&&
    d.bundleId==='ru.gafus.app'&&d.appVersion==='1.7.5'&&
    d.runtimeVersion==='1.7.5'&&d.updateUrl==='https://gafus.ru/ota/manifest'&&
    d.signingKeyId==='gafus-production-20261115'&&d.verified===false&&
    d.sourceSha===committedSha&&/^[1-9]\d{0,9}$/.test(d.buildNumber)&&
    /^[a-f0-9]{64}$/.test(d.nativeFingerprint),'REGISTERED_DESCRIPTOR_INVALID');
  check(crypto.createHash('sha256').update(certificate).digest('hex')===d.certificateSha256&&
    d.certificatePem===certificate,'OTA_CERTIFICATE_MISMATCH');
  return d;
}

export function parseRemoteVersion(output){
  let d;
  try {d=JSON.parse(output);} catch {fail('EAS_REMOTE_VERSION_UNREADABLE');}
  check(typeof d.buildNumber==='string'&&/^[1-9]\d*$/.test(d.buildNumber),
    'EAS_REMOTE_BUILD_NUMBER_MISSING');
  return d.buildNumber;
}

function assertCleanPushedSource(){
  check(git(['branch','--show-current'])==='main','MAIN_REQUIRED');
  check(git(['status','--porcelain','--untracked-files=all'])==='','CLEAN_COMMITTED_SOURCE_REQUIRED');
  check(git(['ls-remote','--exit-code','origin','refs/heads/main']).split(/\s+/)[0]===sha(),
    'PUSH_TO_MAIN_FIRST');
}
function stageCertificate(){
  const pem=fs.readFileSync(cert,'utf8');
  fs.mkdirSync(path.dirname(stagedCert),{recursive:true,mode:0o700});
  if(fs.existsSync(stagedCert))check(fs.readFileSync(stagedCert,'utf8')===pem,'STAGED_CERT_MISMATCH');
  else fs.writeFileSync(stagedCert,pem,{mode:0o600,flag:'wx'});
  fs.chmodSync(stagedCert,0o600);
  return pem;
}
function stageDescriptor(){
  const descriptor=fs.readFileSync(descriptorPath());
  if(fs.existsSync(stagedDescriptor)){
    check(fs.readFileSync(stagedDescriptor).equals(descriptor),'STAGED_DESCRIPTOR_MISMATCH');
  }else fs.writeFileSync(stagedDescriptor,descriptor,{flag:'wx',mode:0o600});
  fs.chmodSync(stagedDescriptor,0o600);
}
function validateProfileFiles(){
  assertEasArchiveRules();
  const eas=JSON.parse(fs.readFileSync(path.join(mobile,'eas.json'),'utf8'));
  const app=JSON.parse(fs.readFileSync(path.join(mobile,'app.json'),'utf8')).expo;
  return validateStoreProfile(eas,app);
}
function prepare(buildNumber){
  check(/^[1-9]\d{0,8}$/.test(buildNumber),'BUILD_NUMBER_INVALID');
  validateProfileFiles();assertCleanPushedSource();
  const pem=fs.readFileSync(cert,'utf8');
  const commit=sha();
  const config={environment:'production',platform:'ios',distribution:'app-store',buildNumber,
    operationId:`gafus-ota175-ios-store-${commit.slice(0,12)}-${buildNumber}`,
    sourceSha:commit,apiOrigin:'https://gafus.ru',
    ciRunId:`local-ios-store-${commit.slice(0,12)}`,
    buildLogRef:`ios-store-175-${commit.slice(0,12)}`};
  const candidate=prepareNativeCandidate({root,config,certificatePem:pem}).candidate;
  const filename=candidatePath();
  if(fs.existsSync(filename))check(JSON.stringify(JSON.parse(fs.readFileSync(filename)))===JSON.stringify(candidate),
    'EXISTING_CANDIDATE_DIFFERS');
  else writeOnce(filename,candidate);
  stageCertificate();
  console.log(JSON.stringify({state:'REGISTER_IOS_STORE_CANDIDATE_IN_ADMIN',sourceSha:commit,
    candidate:filename,next:`pnpm ota:175:ios:store:finalize <nativeReleaseId>`},null,2));
}
function finalize(id){
  check(UUID.test(id??''),'SERVER_ID_REQUIRED');
  validateProfileFiles();assertCleanPushedSource();
  const candidate=JSON.parse(fs.readFileSync(candidatePath(),'utf8'));
  check(candidate.distribution==='app-store'&&candidate.platform==='ios','NOT_STORE_CANDIDATE');
  const descriptor=finalizeNativeBuild({root,candidate,nativeId:id,certificatePem:stageCertificate()});
  const target=descriptorPath();
  if(fs.existsSync(target))check(JSON.stringify(JSON.parse(fs.readFileSync(target)))===JSON.stringify(descriptor),
    'EXISTING_DESCRIPTOR_DIFFERS');
  else writeOnce(target,descriptor);
  stageDescriptor();
  console.log(JSON.stringify({state:'STORE_OTA_DESCRIPTOR_READY',file:target,
    next:'pnpm ota:175:ios:store:check'},null,2));
}
function checkBuild(){
  const profile=validateProfileFiles();assertCleanPushedSource();
  const d=validateStoreDescriptor(JSON.parse(fs.readFileSync(descriptorPath(),'utf8')),sha(),stageCertificate());
  const actual=computeNativeSourceFingerprint(root,{platform:'ios',environment:'production',
    channel:'production',runtimeVersion:'1.7.5',appVersion:'1.7.5',
    signingKeyId:d.signingKeyId,certificateSha256:d.certificateSha256,
    updateUrl:d.updateUrl});
  check(actual.fingerprint===d.nativeFingerprint,'REGISTERED_NATIVE_FINGERPRINT_CHANGED');
  stageDescriptor();
  const env={...process.env,...profile.env};
  const app=JSON.parse(fs.readFileSync(path.join(mobile,'app.json'),'utf8')).expo;
  const config=applyNativeSelfHostedProfile(app,{appRoot:mobile,environment:env});
  check(config.updates?.url===d.updateUrl&&config.updates?.checkAutomatically==='NEVER'&&
    config.updates?.codeSigningMetadata?.keyid===d.signingKeyId&&
    config.updates?.requestHeaders?.['x-gafus-native-fingerprint']===d.nativeFingerprint&&
    config.ios?.buildNumber===d.buildNumber,'OTA_EMBEDDED_CONFIG_INVALID');
  return {descriptor:d,env};
}
function eas(args,env,capture=false){
  const result=spawnSync('npx',['--yes','eas-cli@latest',...args],
    {cwd:mobile,env,encoding:capture?'utf8':undefined,stdio:capture?['ignore','pipe','inherit']:'inherit'});
  if(result.error)throw result.error;
  check(result.status===0,`EAS_CLI_EXIT_${result.status}`);
  return capture?result.stdout:'';
}
function build(){
  const {descriptor:d,env}=checkBuild();
  const remote=parseRemoteVersion(eas(['build:version:get','--platform','ios','--profile',profileName,
    '--json','--non-interactive'],env,true));
  check(remote===d.buildNumber,`EAS_REMOTE_NUMBER_${remote}_EXPECTED_${d.buildNumber}_USE_EAS_BUILD_VERSION_SET`);
  const prebuild=spawnSync('pnpm',['exec','expo','prebuild','--platform','ios','--no-install'],
    {cwd:mobile,env,stdio:'inherit'});
  if(prebuild.error)throw prebuild.error;
  check(prebuild.status===0,'PREBUILD_FAILED');
  assertGeneratedNativeOta('ios',{...d,buildNumber:d.buildNumber});
  assertCleanPushedSource();
  const output=path.join(mobile,`gafus-1.7.5-${d.buildNumber}-self-hosted-store.ipa`);
  check(!fs.existsSync(output),'OUTPUT_ALREADY_EXISTS');
  eas(['build','--platform','ios','--profile',profileName,'--local','--clear-cache','--output',output],env);
  assertCleanPushedSource();
  const result=verifyIpa(output,d);
  console.log(JSON.stringify({state:'STORE_IPA_SIGNING_AND_SELF_HOSTED_OTA_VERIFIED_NOT_SUBMITTED',...result},null,2));
}
function main(){
  const [action,arg]=process.argv.slice(2);
  if(action==='prepare'){check(Boolean(arg),'BUILD_NUMBER_REQUIRED');prepare(arg);}
  else if(action==='finalize')finalize(arg);
  else if(action==='check'){const r=checkBuild();console.log(JSON.stringify({state:'READY_FOR_LOCAL_EAS_BUILD',
    version:'1.7.5',buildNumber:r.descriptor.buildNumber,updateUrl:r.descriptor.updateUrl,
    note:'EAS remote build number is checked on BUILD, not during offline check'},null,2));}
  else if(action==='build'&&!arg)build();
  else if(action==='verify-ipa'&&arg){
    // Reverify a built IPA against its original immutable server-issued descriptor.
    // Unlike the build command, artifact verification must work after later commits.
    const descriptor=JSON.parse(fs.readFileSync(stagedDescriptor,'utf8'));
    const certificate=fs.readFileSync(stagedCert,'utf8');
    validateStoreDescriptor(descriptor,descriptor.sourceSha,certificate);
    console.log(JSON.stringify({state:'STORE_IPA_SIGNING_AND_SELF_HOSTED_OTA_VERIFIED',
      ...verifyIpa(path.resolve(arg),descriptor)},null,2));}
  else fail('USAGE_PREPARE_NUMBER_FINALIZE_UUID_CHECK_BUILD_VERIFY_IPA_PATH');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main();}catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1;}
}
