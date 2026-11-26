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
import {applyNativeSelfHostedProfile} from './self-hosted-native-profile.cjs';

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
/** EAS .easignore overrides *all* nested .gitignore files in the monorepo. */
export function expectedEasIgnore(){
  let expected='# EAS local Store IPA: mirror root and every nested .gitignore; include only public OTA trust files.\n'+
    fs.readFileSync(path.join(root,'.gitignore'),'utf8')+'\n';
  const files=git(['ls-files','--','**/.gitignore']).split('\n').filter(Boolean).sort();
  for(const filename of files){
    const dir=path.posix.dirname(filename);
    expected+=`\n# From ${filename} (scoped to its directory)\n`;
    for(const line of fs.readFileSync(path.join(root,filename),'utf8').split(/\r?\n/)){
      if(!line||line.startsWith('#')){if(line.startsWith('#'))expected+=line+'\n';continue;}
      const neg=line.startsWith('!')?'!':'';
      const pat=neg?line.slice(1):line;
      const scoped=pat.startsWith('/')?dir+pat:pat.includes('/')?`${dir}/${pat}`:`${dir}/**/${pat}`;
      expected+=neg+scoped+'\n';
    }
  }
  expected+='\n# Only public certificate and admin-issued metadata, not signing credentials.\n'+
    '!apps/mobile/.ota-certs/\napps/mobile/.ota-certs/*\n'+
    '!apps/mobile/.ota-certs/native.pem\n!apps/mobile/.ota-certs/ios-store-native.json\n!apps/mobile/.ota-certs/android-store-native.json\n';
  return expected;
}
function assertEasArchiveRules(){
  check(fs.readFileSync(path.join(root,'.easignore'),'utf8')===expectedEasIgnore(),
    'EASIGNORE_OUT_OF_SYNC');
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
function readPlistFromIpa(ipa,entry){
  const raw=execFileSync('unzip',['-p',ipa,entry],{maxBuffer:4*1024*1024});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-ipa-plist-'));
  const tmp=path.join(dir,'metadata.plist');
  try{fs.writeFileSync(tmp,raw);return JSON.parse(execFileSync('plutil',['-convert','json','-o','-',tmp],
    {encoding:'utf8',maxBuffer:4*1024*1024}));}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
}
/** A decoded Apple profile contains NSDate/NSData values that plutil cannot
 * convert to JSON. Read just the fields needed for Store signature validation.
 */
export function verifyAppleStoreProvisioningProfile(profilePath){
  const lint=spawnSync('/usr/bin/plutil',['-lint',profilePath],{encoding:'utf8'});
  check(!lint.error && lint.status===0,'IPA_PROVISIONING_PLIST_INVALID');
  const read=(key)=>{
    const item=spawnSync('/usr/bin/plutil',['-extract',key,'raw','-o','-',profilePath],
      {encoding:'utf8',maxBuffer:4*1024*1024});
    if(item.error)throw item.error;
    return item.status===0?item.stdout.trim():null;
  };
  const expiry=read('ExpirationDate');
  check(read('ProvisionedDevices')===null && read('ProvisionsAllDevices')!=='true' &&
    read('Entitlements.get-task-allow')==='false' &&
    read('Entitlements.application-identifier')==='PJQ8PP666S.ru.gafus.app' &&
    expiry!==null && Number.isFinite(Date.parse(expiry)) && Date.parse(expiry)>Date.now(),
    'IPA_NOT_APP_STORE_DISTRIBUTION');
}

/** Verify actual Apple code signing and that provisioning is App Store, not ad hoc.
 * This runs only after the user builds the IPA; synthetic plist tests opt out.
 */
function verifyAppleStoreSignature(ipa,infoEntry){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-ios-store-signature-'));
  try{
    const prefix=path.dirname(infoEntry);
    const extracted=spawnSync('unzip',['-q',ipa,`${prefix}/*`,'-d',tmp],
      {encoding:'utf8',maxBuffer:4*1024*1024});
    check(extracted.status===0,'IPA_EXTRACT_FOR_SIGNATURE_FAILED');
    const appDir=path.join(tmp,prefix);
    const verify=spawnSync('/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',appDir],
      {encoding:'utf8',maxBuffer:4*1024*1024});
    check(verify.status===0,'IPA_APPLE_CODESIGN_INVALID');
    const provisioning=path.join(appDir,'embedded.mobileprovision');
    check(fs.existsSync(provisioning),'IPA_APP_STORE_PROVISIONING_MISSING');
    const profileXml=execFileSync('/usr/bin/security',['cms','-D','-i',provisioning],
      {maxBuffer:4*1024*1024});
    const profilePath=path.join(tmp,'provisioning.plist');
    fs.writeFileSync(profilePath,profileXml);
    verifyAppleStoreProvisioningProfile(profilePath);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}

export function verifyIpa(ipa,d,{metadataOnly=false}={}){
  check(fs.existsSync(ipa)&&fs.statSync(ipa).size>10_000_000,'IPA_MISSING_OR_TOO_SMALL');
  const entries=execFileSync('unzip',['-Z','-1',ipa],{encoding:'utf8',maxBuffer:8*1024*1024}).trim().split('\n');
  const info=entries.find(x=>/^Payload\/[^/]+\.app\/Info\.plist$/.test(x));
  check(Boolean(info),'IPA_INFO_PLIST_MISSING');
  const expo=info.replace(/Info\.plist$/,'Expo.plist');
  check(entries.includes(expo),'IPA_EXPO_PLIST_MISSING');
  const i=readPlistFromIpa(ipa,info),e=readPlistFromIpa(ipa,expo);
  check(i.CFBundleIdentifier==='ru.gafus.app'&&i.CFBundleShortVersionString==='1.7.5'&&
    String(i.CFBundleVersion)===d.buildNumber,'IPA_STORE_VERSION_MISMATCH');
  // Xcode 27 / iOS 27 kills legacy UIApplicationDelegate binaries at launch.
  // The actual signed IPA must declare the Expo SDK 57 scene delegate.
  const scenes=i.UIApplicationSceneManifest;
  check(scenes?.UIApplicationSupportsMultipleScenes===false&&
    scenes?.UISceneConfigurations?.UIWindowSceneSessionRoleApplication?.some(
      scene=>scene.UISceneDelegateClassName==='EXExpoAppSceneDelegate'),
    'IPA_IOS27_SCENE_LIFECYCLE_REQUIRED');
  check(e.EXUpdatesRuntimeVersion==='1.7.5'&&e.EXUpdatesURL===d.updateUrl&&
    e.EXUpdatesCheckOnLaunch==='NEVER'&&
    e.EXUpdatesRequestHeaders?.['expo-channel-name']==='production'&&
    e.EXUpdatesRequestHeaders?.['x-gafus-native-fingerprint']===d.nativeFingerprint&&
    e.EXUpdatesCodeSigningMetadata?.keyid===d.signingKeyId&&
    e.EXUpdatesCodeSigningMetadata?.alg==='rsa-v1_5-sha256'&&
    e.EXUpdatesCodeSigningCertificate===d.certificatePem,'IPA_SELF_HOSTED_OTA_MISMATCH');
  if(!metadataOnly){
    execFileSync('python3',[path.join(path.dirname(fileURLToPath(import.meta.url)),'verify-native-ota-artifact.py'),ipa],{stdio:'inherit'});
    verifyAppleStoreSignature(ipa,info);
  }
  const digest=crypto.createHash('sha256').update(fs.readFileSync(ipa)).digest('hex');
  return {ipa,version:i.CFBundleShortVersionString,buildNumber:String(i.CFBundleVersion),
    otaUrl:e.EXUpdatesURL,channel:'production',nativeReleaseId:d.id,
    nativeFingerprint:d.nativeFingerprint,sha256:digest};
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
