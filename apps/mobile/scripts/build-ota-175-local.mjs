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
const plist=require('@expo/plist').default;
const OTA_URL='https://gafus.ru/ota/manifest';
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
    signingKeyId:native.signingKeyId,nativeFingerprint:native.nativeFingerprint,environment:{...merged,
      GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR:descriptorFile,
      GAFUS_OTA_NATIVE_CERTIFICATE:env.GAFUS_OTA_NATIVE_CERTIFICATE||'.ota-certs/native.pem'}};
}
/** Refuse to build against a stale ignored ios/android directory from an older Expo release. */
export function assertGeneratedNativeOta(platform,plan,root=mobileRoot) {
  const required=(ok,label)=>{if(!ok)throw Error(`OTA_175_NATIVE_PREBUILD_${label}_MISMATCH`);};
  if(platform==='ios') {
    const nativePlist=plist.parse(fs.readFileSync(path.join(root,'ios/Gafus/Supporting/Expo.plist'),'utf8'));
    const info=plist.parse(fs.readFileSync(path.join(root,'ios/Gafus/Info.plist'),'utf8'));
    const xcode=fs.readFileSync(path.join(root,'ios/Gafus.xcodeproj/project.pbxproj'),'utf8');
    required(info.CFBundleShortVersionString==='1.7.5','IOS_VERSION');
    required(nativePlist.EXUpdatesRuntimeVersion==='1.7.5','IOS_RUNTIME');
    required(nativePlist.EXUpdatesURL===OTA_URL,'IOS_ENDPOINT');
    required(nativePlist.EXUpdatesCheckOnLaunch==='NEVER','IOS_MANUAL_CHECK');
    required(nativePlist.EXUpdatesCodeSigningMetadata?.keyid===plan.signingKeyId &&
      nativePlist.EXUpdatesCodeSigningMetadata?.alg==='rsa-v1_5-sha256','IOS_SIGNING_KEY');
    required(nativePlist.EXUpdatesRequestHeaders?.['x-gafus-native-fingerprint']===plan.nativeFingerprint &&
      nativePlist.EXUpdatesRequestHeaders?.['expo-channel-name']==='production','IOS_FINGERPRINT');
    required(nativePlist.EXUpdatesCodeSigningCertificate===fs.readFileSync(path.join(root,'.ota-certs/native.pem'),'utf8'),'IOS_CERTIFICATE');
    required(info.CFBundleVersion===plan.buildNumber,'IOS_INFO_BUILD_NUMBER');
    // The main target has Debug+Release settings. The Widget extension may
    // also use this build number; only those main settings count for QA.
    const mainBuildValues=[...xcode.matchAll(/CURRENT_PROJECT_VERSION = (\d+);[\s\S]*?PRODUCT_BUNDLE_IDENTIFIER = "ru\.gafus\.app";/g)]
      .map(m=>m[1]);
    required(mainBuildValues.length===2 && mainBuildValues.every(v=>v===plan.buildNumber),
      'IOS_BUILD_NUMBER');
  } else if(platform==='android') {
    const manifest=fs.readFileSync(path.join(root,'android/app/src/main/AndroidManifest.xml'),'utf8');
    const strings=fs.readFileSync(path.join(root,'android/app/src/main/res/values/strings.xml'),'utf8');
    const gradle=fs.readFileSync(path.join(root,'android/app/build.gradle'),'utf8');
    const meta=(key)=>{
      const name=`expo.modules.updates.${key}`;
      const tag=manifest.match(/<meta-data\b[^>]+\/>/g)?.find(t=>t.includes(`android:name="${name}"`));
      return tag?.match(/android:value="([^"]*)"/)?.[1];
    };
    required(/<string name="expo_runtime_version">1\.7\.5<\/string>/.test(strings),'ANDROID_RUNTIME');
    required(/versionName\s+["']1\.7\.5["']/.test(gradle),'ANDROID_VERSION');
    required(new RegExp(`versionCode\\s+${plan.buildNumber}(?!\\d)`).test(gradle),'ANDROID_BUILD_NUMBER');
    required(meta('EXPO_UPDATE_URL')===OTA_URL,'ANDROID_ENDPOINT');
    required(meta('EXPO_UPDATES_CHECK_ON_LAUNCH')==='NEVER','ANDROID_MANUAL_CHECK');
    required(meta('CODE_SIGNING_METADATA')?.includes(plan.signingKeyId),'ANDROID_SIGNING_KEY');
    required(meta('UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY')?.includes(plan.nativeFingerprint) &&
      meta('UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY')?.includes('production'),'ANDROID_FINGERPRINT');
    required(meta('CODE_SIGNING_CERTIFICATE')?.includes('BEGIN CERTIFICATE'),'ANDROID_CERTIFICATE');
  } else throw Error('OTA_175_TARGET_INVALID');
}
/** Expo Constants reads assets/app.config on the first (embedded) launch. The
 * AndroidManifest alone is insufficient: without the same OTA extra fields,
 * the client never requests a named-tester grant for 0% OTA releases.
 */
export function assertEmbeddedAndroidOtaConfig(config,plan) {
  const required=(ok,label)=>{if(!ok)throw Error(`OTA_175_ANDROID_EMBEDDED_${label}_MISMATCH`);};
  required(config?.version==='1.7.5','VERSION');
  required(config?.updates?.url===OTA_URL,'ENDPOINT');
  required(config?.extra?.otaTransport==='self-hosted','TRANSPORT');
  required(config?.extra?.otaEnvironment==='production','ENVIRONMENT');
  required(config?.extra?.otaChannel==='production','CHANNEL');
  required(config?.extra?.otaNativeFingerprint===plan.nativeFingerprint,'FINGERPRINT');
  required(config?.extra?.otaNativeReleaseId===plan.nativeReleaseId,'NATIVE_RELEASE');
  required(config?.android?.versionCode===Number(plan.buildNumber),'BUILD_NUMBER');
}
export function assertBuiltAndroidOtaApk(apkFile,plan) {
  if(!fs.existsSync(apkFile)) throw Error('OTA_175_ANDROID_RELEASE_APK_MISSING');
  let config;
  try {
    const raw=execFileSync('unzip',['-p',apkFile,'assets/app.config'],{maxBuffer:4*1024*1024});
    config=JSON.parse(raw.toString('utf8'));
  } catch {throw Error('OTA_175_ANDROID_EMBEDDED_CONFIG_UNREADABLE');}
  assertEmbeddedAndroidOtaConfig(config,plan);
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
  // `expo run:*` alone reuses ignored native folders and may silently embed
  // an old Expo OTA URL/runtime. Apply the signed config before every build.
  const prebuild=spawnSync('pnpm',['exec','expo','prebuild','--platform',platform,'--no-install'],
    {cwd:mobileRoot,env:plan.environment,stdio:'inherit'});
  if(prebuild.error)throw prebuild.error;
  if(prebuild.status!==0)throw Error(`OTA_175_NATIVE_PREBUILD_FAILED_${prebuild.status}`);
  assertGeneratedNativeOta(platform,plan);
  if(platform==='android') {
    // Gradle's long-lived daemon can retain an earlier generic Expo config.
    // Build from the same verified environment in an isolated Gradle process,
    // then inspect the ACTUAL APK before installing it over user data.
    const built=spawnSync('./gradlew',[':app:assembleRelease','--no-daemon','--console=plain'],
      {cwd:path.join(mobileRoot,'android'),env:plan.environment,stdio:'inherit'});
    if(built.error)throw built.error;
    if(built.status!==0)throw Error(`OTA_175_NATIVE_DEVICE_BUILD_FAILED_${built.status}`);
    const apkFile=path.join(mobileRoot,'android/app/build/outputs/apk/release/app-release.apk');
    assertBuiltAndroidOtaApk(apkFile,plan);
    console.log('OTA_175_ANDROID_APK_EMBEDDED_SELF_HOSTED_CONFIG_VERIFIED');
    // -r preserves installed application data; never uninstall the old build.
    const installed=spawnSync('adb',['-d','install','-r',apkFile],{env:plan.environment,stdio:'inherit'});
    if(installed.error)throw installed.error;
    if(installed.status!==0)throw Error(`OTA_175_ANDROID_DEVICE_INSTALL_FAILED_${installed.status}`);
  } else {
    const child=spawnSync('pnpm',['exec','expo','run:ios','--device','--configuration','Release'],
      {cwd:mobileRoot,env:plan.environment,stdio:'inherit'});
    if(child.error)throw child.error;
    if(child.status!==0)throw Error(`OTA_175_NATIVE_DEVICE_BUILD_FAILED_${child.status}`);
  }
  console.log('OTA_175_NATIVE_BUILD_COMPLETED_REQUIRES_REAL_DEVICE_VERIFICATION');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{main();}catch(err){console.error(err instanceof Error?err.message:String(err));process.exitCode=1;}
}
