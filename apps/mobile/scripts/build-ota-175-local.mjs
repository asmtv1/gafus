#!/usr/bin/env node
/** Strict signed 1.7.5 internal DEVICE build without EAS remote version override.
 * No Store submission, OTA publish, Git operation or credential write here.
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const mobileRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repoRoot=path.resolve(mobileRoot,'../..');
const profile=require('./self-hosted-native-profile.cjs');
export function validate175DeviceBuild(platform,env,repo=repoRoot) {
  if(!['android','ios'].includes(platform)) throw Error('OTA_175_TARGET_INVALID');
  const root=path.join(repo,'apps/mobile');
  const eas=JSON.parse(fs.readFileSync(path.join(root,'eas.json'),'utf8'));
  const configName=`ota-175-${platform}-internal`;
  const preset=eas.build[configName];
  if(!preset || preset.channel!=='production' || preset.environment!=='production' ||
      preset.distribution!=='internal' || preset.env?.GAFUS_OTA_TARGET_PLATFORM!==platform)
    throw Error('OTA_175_INTERNAL_BUILD_PROFILE_INVALID');
  const merged={...env,...preset.env};
  const descriptorFile=env.GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR;
  if(!descriptorFile || !path.isAbsolute(descriptorFile))
    throw Error('OTA_175_NATIVE_DESCRIPTOR_ABSOLUTE_PATH_REQUIRED');
  const native=JSON.parse(fs.readFileSync(descriptorFile,'utf8'));
  if(native.environment!=='production' || native.channel!=='production' ||
     native.platform!==platform || native.appVersion!=='1.7.5' ||
     native.runtimeVersion!=='1.7.5' || native.distribution!=='internal' ||
     native.signingKeyId!=='gafus-production-20261115' || native.verified!==false)
    throw Error('OTA_175_UNVERIFIED_INTERNAL_NATIVE_DESCRIPTOR_REQUIRED');
  const current=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
  if(current!==native.sourceSha) throw Error('OTA_175_NATIVE_SOURCE_SHA_MISMATCH');
  const dirty=execFileSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'}).trim();
  if(dirty) throw Error('OTA_175_BUILD_REQUIRES_CLEAN_COMMITTED_SOURCE');
  const configured=profile.applyNativeSelfHostedProfile(
    JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')).expo,
    {appRoot:root,environment:{...merged,
      GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR:descriptorFile,
      GAFUS_OTA_NATIVE_CERTIFICATE:env.GAFUS_OTA_NATIVE_CERTIFICATE || '.ota-certs/native.pem'}});
  if(configured.version!=='1.7.5' || configured.updates?.url!=='https://gafus.ru/ota/manifest' ||
     configured.updates?.codeSigningMetadata?.keyid!=='gafus-production-20261115' ||
     configured.updates?.checkAutomatically!=='NEVER' ||
     (platform==='android' ? configured.android?.versionCode!==Number(native.buildNumber) :
       configured.ios?.buildNumber!==native.buildNumber))
    throw Error('OTA_175_NATIVE_RUNTIME_CODE_SIGNING_OR_BUILD_VERSION_MISMATCH');
  return {profile:configName,appVersion:'1.7.5',platform,sourceSha:current,
    buildNumber:native.buildNumber,nativeReleaseId:native.id,
    signingKeyId:native.signingKeyId,environment:{...merged,
      GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR:descriptorFile,
      GAFUS_OTA_NATIVE_CERTIFICATE:env.GAFUS_OTA_NATIVE_CERTIFICATE||'.ota-certs/native.pem'}};
}
function main(){
  const [platform,mode]=process.argv.slice(2);
  if(!['android','ios'].includes(platform) || (mode && mode!=='--check'))
    throw Error('USAGE: node scripts/build-ota-175-local.mjs android|ios [--check]');
  const plan=validate175DeviceBuild(platform,process.env);
  console.log(JSON.stringify({state:mode==='--check'?'OTA_175_NATIVE_LOCAL_PREFLIGHT_PASS':'OTA_175_NATIVE_LOCAL_BUILD_START',
    platform:plan.platform,appVersion:plan.appVersion,buildNumber:plan.buildNumber,
    nativeReleaseId:plan.nativeReleaseId,sourceSha:plan.sourceSha}));
  if(mode==='--check')return;
  const argv=platform==='android' ? ['exec','expo','run:android','--device','--variant','release'] :
    ['exec','expo','run:ios','--device','--configuration','Release'];
  const child=spawnSync('pnpm',argv,{cwd:mobileRoot,env:plan.environment,stdio:'inherit'});
  if(child.error)throw child.error;
  if(child.status!==0) throw Error(`OTA_175_NATIVE_DEVICE_BUILD_FAILED_${child.status}`);
  console.log('OTA_175_NATIVE_BUILD_COMPLETED_REQUIRES_REAL_DEVICE_VERIFICATION');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{main();}catch(err){console.error(err instanceof Error?err.message:String(err));process.exitCode=1;}
}
