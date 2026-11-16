#!/usr/bin/env node
/** Prepare both production 1.7.5 native candidates only after main is pushed.
 * Registration is a separate ADMIN action; builds never publish OTA updates.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareNativeCandidate,finalizeNativeBuild} from './prepare-self-hosted-native-build.mjs';
const mobileRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(mobileRoot,'../..');
const certSource=path.join(mobileRoot,'ota-public-certificates/gafus-production-20261115.cert.txt');
const certificatePath=path.join(mobileRoot,'.ota-certs/native.pem');
const base=path.join(os.homedir(),'.config/gafus/ota/native-175');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function required(condition,message){if(!condition)throw Error(`OTA_175_SETUP_${message}`);}
function git(args){return execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:15000}).trim();}
function shaAndDirectory(){
  const sha=git(['rev-parse','HEAD']);
  required(/^[a-f0-9]{40}$/.test(sha),'INVALID_GIT_SHA');
  return {sha,dir:path.join(base,sha)};
}
function assertReadyForRegistration(sha){
  required(git(['branch','--show-current'])==='main','REQUIRES_MAIN_BRANCH');
  required(git(['status','--porcelain','--untracked-files=all'])==='','REQUIRES_CLEAN_COMMITTED_TREE');
  const remote=execFileSync('git',['ls-remote','--exit-code','origin','refs/heads/main'],
    {cwd:root,encoding:'utf8',timeout:20000}).trim().split(/\s+/)[0];
  required(remote===sha,'PUSH_MAIN_FIRST');
}
export function createNative175Config(platform,sha,buildNumber='17501'){
  required(['ios','android'].includes(platform),'INVALID_PLATFORM');
  required(/^[a-f0-9]{40}$/.test(sha),'INVALID_GIT_SHA');
  required(/^[1-9]\d{0,8}$/.test(buildNumber),'INVALID_BUILD_NUMBER');
  return {environment:'production',platform,distribution:'internal',buildNumber,
    operationId:`gafus-ota175-${platform}-${sha.slice(0,12)}-${buildNumber}`,
    sourceSha:sha,apiOrigin:'https://gafus.ru',
    ciRunId:`local-ota175-${platform}-${sha.slice(0,12)}`,
    buildLogRef:`native-175-${platform}-${sha.slice(0,12)}`};
}
function writeOnce(filename,value){
  required(!fs.existsSync(filename),'EXISTING_FILE_REFUSE_OVERWRITE');
  fs.writeFileSync(filename,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
}
function stageCert(){
  const cert=fs.readFileSync(certSource);
  fs.mkdirSync(path.dirname(certificatePath),{recursive:true,mode:0o700});
  if(fs.existsSync(certificatePath))required(fs.readFileSync(certificatePath).equals(cert),'LOCAL_CERT_MISMATCH');
  else fs.writeFileSync(certificatePath,cert,{mode:0o600,flag:'wx'});
  fs.chmodSync(certificatePath,0o600);
  return cert.toString('utf8');
}
function prepare(buildNumber){
  const {sha,dir}=shaAndDirectory();
  assertReadyForRegistration(sha);
  const cert=fs.readFileSync(certSource,'utf8');
  // Fully validate both candidates before creating any files.
  const results=['ios','android'].map(platform=>{
    const config=createNative175Config(platform,sha,buildNumber);
    return {platform,config,candidate:prepareNativeCandidate({root,config,certificatePem:cert}).candidate};
  });
  if(fs.existsSync(dir)){
    for(const {platform,config,candidate} of results){
      const filename=path.join(dir,`${platform}-candidate.json`);
      const configFile=path.join(dir,`${platform}-config.json`);
      required(fs.existsSync(filename)&&fs.existsSync(configFile),'EXISTING_PREPARATION_INCOMPLETE');
      required(JSON.stringify(JSON.parse(fs.readFileSync(filename,'utf8')))===JSON.stringify(candidate) &&
        JSON.stringify(JSON.parse(fs.readFileSync(configFile,'utf8')))===JSON.stringify(config),
        'EXISTING_PREPARATION_DIFFERENT');
    }
  } else {
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    for(const {platform,config,candidate} of results){
      writeOnce(path.join(dir,`${platform}-config.json`),config);
      writeOnce(path.join(dir,`${platform}-candidate.json`),candidate);
    }
  }
  stageCert();
  console.log(JSON.stringify({state:'OTA_175_CANDIDATES_READY_FOR_ADMIN_REGISTRATION',sourceSha:sha,
    admin:'Нативные сборки → Регистрация нативной поставки',
    iosCandidate:path.join(dir,'ios-candidate.json'),
    androidCandidate:path.join(dir,'android-candidate.json'),
    next:'Register BOTH JSON candidates via admin UI; save the returned nativeReleaseId for each platform. OTA not published.'},null,2));
}
function finalize(platform,id){
  required(['ios','android'].includes(platform),'INVALID_PLATFORM');
  required(UUID.test(id??''),'INVALID_SERVER_NATIVE_RELEASE_ID');
  const {sha,dir}=shaAndDirectory();
  assertReadyForRegistration(sha);
  const candidateFile=path.join(dir,`${platform}-candidate.json`);
  required(fs.existsSync(candidateFile),'CANDIDATE_NOT_PREPARED');
  const descriptor=finalizeNativeBuild({root,candidate:JSON.parse(fs.readFileSync(candidateFile,'utf8')),
    nativeId:id,certificatePem:fs.readFileSync(certSource,'utf8')});
  const filename=path.join(dir,`${platform}-native.json`);
  if(fs.existsSync(filename)){
    required(JSON.stringify(JSON.parse(fs.readFileSync(filename,'utf8')))===JSON.stringify(descriptor),'EXISTING_DESCRIPTOR_DIFFERENT');
  }else writeOnce(filename,descriptor);
  stageCert();
  console.log(JSON.stringify({state:'OTA_175_NATIVE_DESCRIPTOR_READY',platform,sourceSha:sha,
    descriptor:filename,checkCommand:`pnpm ota:175:check ${platform}`,
    buildCommand:`pnpm ota:175:build ${platform}`},null,2));
}
function runBuild(platform,mode){
  required(['ios','android'].includes(platform),'INVALID_PLATFORM');
  const {sha,dir}=shaAndDirectory();
  const descriptor=path.join(dir,`${platform}-native.json`);
  required(fs.existsSync(descriptor),'REGISTER_AND_FINALIZE_NATIVE_FIRST');
  stageCert();
  const result=spawnSync(process.execPath,[path.join(mobileRoot,'scripts/build-ota-175-local.mjs'),platform,
    ...(mode==='check'?['--check']:[])],{cwd:mobileRoot,stdio:'inherit',env:{...process.env,
      GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR:descriptor,GAFUS_OTA_NATIVE_CERTIFICATE:'.ota-certs/native.pem'}});
  if(result.error)throw result.error;
  required(result.status===0,`NATIVE_${mode.toUpperCase()}_FAILED_${result.status}`);
}
function main(){
  const [action,arg1,arg2]=process.argv.slice(2);
  if(action==='prepare'&&(!arg1||/^[1-9]\d{0,8}$/.test(arg1))&&!arg2)prepare(arg1||'17501');
  else if(action==='finalize'&&arg1&&arg2)finalize(arg1,arg2);
  else if(['check','build'].includes(action)&&arg1&&!arg2)runBuild(arg1,action);
  else throw Error('USAGE: prepare [buildNumber] | finalize <ios|android> <serverNativeReleaseId> | check <ios|android> | build <ios|android>');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{main();}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
