#!/usr/bin/env node
/** Registered store IPA: no version overrides, no submission. */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {mobileRoot,loadRegisteredTarget,validateRegisteredTarget} from './native-release-target.mjs';
import {assertGeneratedNativeOta} from './native-generated-config.mjs';
import {verifyIpa} from './native-ios-store-artifact.mjs';
const [action,arg,...rest]=process.argv.slice(2);
if(rest.length||!['check','build','verify-ipa'].includes(action)||(action==='verify-ipa')!==Boolean(arg))
  throw Error('USAGE: native-ios-store.mjs check|build|verify-ipa <ipa>');
const env={...process.env,GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR:process.env.GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR||'.ota-certs/ios-store-native.json'};
if(action==='verify-ipa'){
  // Verify immutable artifact against original descriptor, even after HEAD changes.
  const d=JSON.parse(fs.readFileSync(path.resolve(mobileRoot,env.GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR),'utf8'));
  validateRegisteredTarget(d,{platform:'ios',distribution:'app-store',environment:'production',
    appVersion:d.appVersion,sourceSha:d.sourceSha,
    certificatePem:fs.readFileSync(path.resolve(mobileRoot,env.GAFUS_OTA_NATIVE_CERTIFICATE||'.ota-certs/native.pem'),'utf8')});
  console.log(JSON.stringify(verifyIpa(path.resolve(arg),d),null,2));
}else{
  const target=loadRegisteredTarget({platform:'ios',distribution:'app-store',env,requirePushed:action==='build'});
  const eas=JSON.parse(fs.readFileSync(path.join(mobileRoot,'eas.json'),'utf8'));
  const profile=eas.build?.['native-ios-store'];
  if(eas.cli?.appVersionSource!=='remote'||profile?.distribution!=='store'||profile?.channel!=='production'||
      profile?.environment!=='production'||profile?.autoIncrement!==false||profile?.ios?.simulator!==false||
      profile?.env?.GAFUS_OTA_TRANSPORT!=='self-hosted'||profile?.env?.GAFUS_OTA_LOCAL_STORE_BUILD!=='true'||
      profile?.env?.EXPO_PUBLIC_APP_VERSION!==undefined||
      profile?.env?.GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR!=='.ota-certs/ios-store-native.json'||
      profile?.env?.GAFUS_OTA_NATIVE_CERTIFICATE!=='.ota-certs/native.pem')
    throw Error('NATIVE_IOS_STORE_PROFILE_INVALID');
  console.log(JSON.stringify({state:'NATIVE_STORE_PREFLIGHT_PASS',appVersion:target.appVersion,
    buildNumber:target.buildNumber,nativeReleaseId:target.id,nativeFingerprint:target.nativeFingerprint}));
  if(action==='build'){
    const buildEnv={...target.buildEnv,...profile.env,EXPO_PUBLIC_APP_VERSION:target.appVersion};
    const run=(cmd,args,capture=false)=>{
      const result=spawnSync(cmd,args,{cwd:mobileRoot,env:buildEnv,encoding:capture?'utf8':undefined,
        stdio:capture?['ignore','pipe','inherit']:'inherit'});
      if(result.error)throw result.error;
      if(result.status!==0)throw Error('NATIVE_IOS_STORE_COMMAND_FAILED:'+cmd);
      return result.stdout;
    };
    const cli=['--yes','eas-cli@27.4.1'];
    const profileArgs=['--platform','ios','--profile','native-ios-store'];
    const remote=JSON.parse(run('npx',[...cli,'build:version:get',...profileArgs,'--json','--non-interactive'],true));
    if(remote.buildNumber!==target.buildNumber)throw Error('NATIVE_IOS_STORE_REMOTE_BUILD_NUMBER_MISMATCH');
    run('pnpm',['exec','expo','prebuild','--platform','ios','--no-install']);
    assertGeneratedNativeOta('ios',target);
    const output=path.join(mobileRoot,'gafus-'+target.appVersion+'-'+target.buildNumber+'-self-hosted-store.ipa');
    if(fs.existsSync(output))throw Error('NATIVE_IOS_STORE_OUTPUT_ALREADY_EXISTS');
    run('npx',[...cli,'build',...profileArgs,'--local','--clear-cache','--output',output,'--non-interactive']);
    console.log(JSON.stringify({state:'NATIVE_STORE_IPA_VERIFIED_NOT_SUBMITTED',...verifyIpa(output,target)},null,2));
  }
}
