#!/usr/bin/env node
/** Descriptor-driven physical device release; no store upload or OTA publish. */
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {mobileRoot,loadRegisteredTarget} from './native-release-target.mjs';
import {assertGeneratedNativeOta,assertBuiltAndroidOtaApk} from './native-generated-config.mjs';
const [platform,mode,...rest]=process.argv.slice(2);
if(!['ios','android'].includes(platform)||rest.length||(mode&&mode!=='--check'))
  throw Error('USAGE: run-signed-native-release.mjs ios|android [--check]');
const target=loadRegisteredTarget({platform,distribution:'internal'});
console.log(JSON.stringify({state:'NATIVE_RELEASE_PREFLIGHT_PASS',platform,distribution:target.distribution,
  appVersion:target.appVersion,buildNumber:target.buildNumber,nativeReleaseId:target.id,
  sourceSha:target.sourceSha,nativeFingerprint:target.nativeFingerprint}));
if(mode==='--check')process.exit(0);
function run(cmd,args,cwd=mobileRoot){
  const p=spawnSync(cmd,args,{cwd,env:target.buildEnv,stdio:'inherit'});
  if(p.error)throw p.error;
  if(p.status!==0)throw Error('NATIVE_RELEASE_COMMAND_FAILED:'+cmd);
}
run('pnpm',['exec','expo','prebuild','--platform',platform,'--no-install']);
assertGeneratedNativeOta(platform,target);
if(platform==='android'){
  run('./gradlew',[':app:assembleRelease','--no-daemon','--console=plain'],resolve(mobileRoot,'android'));
  const apk=resolve(mobileRoot,'android/app/build/outputs/apk/release/app-release.apk');
  assertBuiltAndroidOtaApk(apk,target);
  run('adb',['-d','install','-r',apk]);
}else{
  run('pnpm',['exec','expo','run:ios','--device','--configuration','Release']);
}
console.log('NATIVE_DEVICE_BUILD_COMPLETED_REQUIRES_REAL_DEVICE_VERIFICATION');
