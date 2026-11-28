/** Shared native CNG and embedded-config verification for registered targets. */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const mobileRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

export function assertGeneratedNativeOta(platform,plan,root=mobileRoot) {
  const required=(ok,label)=>{if(!ok)throw Error(`NATIVE_PREBUILD_${label}_MISMATCH`);};
  const {appVersion, runtimeVersion, updateUrl, channel} = plan;
  required(/^\d+\.\d+\.\d+$/.test(appVersion) && runtimeVersion === appVersion,'TARGET');
  if(platform==='ios') {
    const plist=require('@expo/plist').default;
    const nativePlist=plist.parse(fs.readFileSync(path.join(root,'ios/Gafus/Supporting/Expo.plist'),'utf8'));
    const info=plist.parse(fs.readFileSync(path.join(root,'ios/Gafus/Info.plist'),'utf8'));
    const xcode=fs.readFileSync(path.join(root,'ios/Gafus.xcodeproj/project.pbxproj'),'utf8');
    required(info.CFBundleShortVersionString===appVersion,'IOS_VERSION');
    required(nativePlist.EXUpdatesRuntimeVersion===runtimeVersion,'IOS_RUNTIME');
    required(nativePlist.EXUpdatesURL===updateUrl,'IOS_ENDPOINT');
    required(nativePlist.EXUpdatesCheckOnLaunch==='NEVER','IOS_MANUAL_CHECK');
    required(nativePlist.EXUpdatesCodeSigningMetadata?.keyid===plan.signingKeyId &&
      nativePlist.EXUpdatesCodeSigningMetadata?.alg==='rsa-v1_5-sha256','IOS_SIGNING_KEY');
    required(nativePlist.EXUpdatesRequestHeaders?.['x-gafus-native-fingerprint']===plan.nativeFingerprint &&
      nativePlist.EXUpdatesRequestHeaders?.['expo-channel-name']===channel,'IOS_FINGERPRINT');
    required(nativePlist.EXUpdatesCodeSigningCertificate===fs.readFileSync(path.resolve(root,plan.certificatePath || '.ota-certs/native.pem'),'utf8'),'IOS_CERTIFICATE');
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
    required(strings.includes(`<string name="expo_runtime_version">${runtimeVersion}</string>`),'ANDROID_RUNTIME');
    required([...gradle.matchAll(/versionName\s+["']([^"']+)["']/g)].some(m=>m[1]===appVersion),'ANDROID_VERSION');
    required(new RegExp(`versionCode\\s+${plan.buildNumber}(?!\\d)`).test(gradle),'ANDROID_BUILD_NUMBER');
    required(meta('EXPO_UPDATE_URL')===updateUrl,'ANDROID_ENDPOINT');
    required(meta('EXPO_UPDATES_CHECK_ON_LAUNCH')==='NEVER','ANDROID_MANUAL_CHECK');
    required(meta('EXPO_UPDATES_LAUNCH_WAIT_MS')==='60000','ANDROID_OTA_NETWORK_TIMEOUT');
    required(meta('CODE_SIGNING_METADATA')?.includes(plan.signingKeyId),'ANDROID_SIGNING_KEY');
    required(meta('UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY')?.includes(plan.nativeFingerprint) &&
      meta('UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY')?.includes(channel),'ANDROID_FINGERPRINT');
    required(meta('CODE_SIGNING_CERTIFICATE')?.includes('BEGIN CERTIFICATE'),'ANDROID_CERTIFICATE');
  } else throw Error('NATIVE_TARGET_INVALID');
}
/** Expo Constants reads assets/app.config on the first (embedded) launch. The
 * AndroidManifest alone is insufficient: without the same OTA extra fields,
 * the client never requests a named-tester grant for 0% OTA releases.
 */
export function assertEmbeddedAndroidOtaConfig(config,plan) {
  const required=(ok,label)=>{if(!ok)throw Error(`NATIVE_ANDROID_EMBEDDED_${label}_MISMATCH`);};
  const {appVersion,updateUrl,channel,environment}=plan;
  required(config?.version===appVersion,'VERSION');
  required(config?.updates?.url===updateUrl,'ENDPOINT');
  required(config?.updates?.fallbackToCacheTimeout===60000,'NETWORK_TIMEOUT');
  required(config?.extra?.otaTransport==='self-hosted','TRANSPORT');
  required(config?.extra?.otaEnvironment===environment,'ENVIRONMENT');
  required(config?.extra?.otaChannel===channel,'CHANNEL');
  required(config?.extra?.otaNativeFingerprint===plan.nativeFingerprint,'FINGERPRINT');
  required(config?.extra?.otaNativeReleaseId===(plan.nativeReleaseId??plan.id),'NATIVE_RELEASE');
  required(config?.android?.versionCode===Number(plan.buildNumber),'BUILD_NUMBER');
}
export function assertBuiltAndroidOtaApk(apkFile,plan) {
  if(!fs.existsSync(apkFile)) throw Error('NATIVE_ANDROID_RELEASE_APK_MISSING');
  let config;
  try {
    const raw=execFileSync('unzip',['-p',apkFile,'assets/app.config'],{maxBuffer:4*1024*1024});
    config=JSON.parse(raw.toString('utf8'));
  } catch {throw Error('NATIVE_ANDROID_EMBEDDED_CONFIG_UNREADABLE');}
  assertEmbeddedAndroidOtaConfig(config,plan);
  execFileSync('python3',[path.join(path.dirname(fileURLToPath(import.meta.url)),'verify-native-ota-artifact.py'),apkFile,'--environment',plan.environment,...(plan.descriptorFile?['--descriptor',plan.descriptorFile]:[])],{stdio:'inherit'});
}
