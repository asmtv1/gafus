/**
 * Native binary / EAS Update compatibility checks. Source-only, no network,
 * keystore, provider API, native build or production secrets.
 *
 * A new native module MUST NOT share the old SDK-wide OTA runtime. Expo SDK 55
 * explicitly supports appVersion runtime isolation for this use case.
 */
export const minimumStoreRelease = '1.7.3';
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function compareStoreVersions(a,b) {
  if (!semver.test(a ?? '') || !semver.test(b ?? '')) throw Error('MOBILE_STORE_SEMVER_INVALID');
  const aa=a.split('.').map(Number),bb=b.split('.').map(Number);
  for(let i=0;i<3;i++) if(aa[i]!==bb[i]) return aa[i]-bb[i];
  return 0;
}

export function validateNativeReleaseContract({ expo, mobilePackage, eas, env = {} }) {
  const errors=[];
  const requireCheck=(condition,code)=>{ if(!condition) errors.push(code); };
  requireCheck(semver.test(expo.version ?? '') && compareStoreVersions(expo.version,minimumStoreRelease)>=0,
    'MOBILE_VERSION_NEW_NATIVE_BUILD_REQUIRED');
  requireCheck(mobilePackage.version===expo.version,'MOBILE_PACKAGE_AND_EXPO_VERSION_MUST_MATCH');
  requireCheck(expo.runtimeVersion?.policy==='appVersion',
    'MOBILE_OTA_RUNTIME_MUST_BE_APP_VERSION_NOT_SDK_VERSION');
  requireCheck(!expo.ios?.runtimeVersion && !expo.android?.runtimeVersion,
    'MOBILE_PLATFORM_OTA_RUNTIME_OVERRIDE_FORBIDDEN');
  requireCheck(expo.android?.softwareKeyboardLayoutMode==='resize',
    'MOBILE_ANDROID_KEYBOARD_MUST_RESIZE');
  requireCheck(expo.android?.predictiveBackGestureEnabled===true,
    'MOBILE_ANDROID_PREDICTIVE_BACK_REQUIRED');
  requireCheck(expo.android?.package==='ru.gafus.app' && expo.ios?.bundleIdentifier==='ru.gafus.app',
    'MOBILE_STORE_BUNDLE_IDENTIFIER_CHANGED');
  requireCheck(expo.splash?.resizeMode==='contain' && expo.ios?.splash?.resizeMode==='contain',
    'MOBILE_SPLASH_MUST_FIT_SCREEN');
  const plugins=(expo.plugins ?? []).map(p=>typeof p==='string'?p:p?.[0]);
  for(const key of ['expo-video','expo-image-picker','expo-notifications','expo-secure-store','./plugins/withAppTracerNative']) {
    requireCheck(plugins.includes(key),`MOBILE_REQUIRED_NATIVE_PLUGIN_MISSING:${key}`);
  }
  for(const key of ['react-native-compressor','react-native-gesture-handler',
    'react-native-reanimated','expo-updates']) {
    requireCheck(Boolean(mobilePackage.dependencies?.[key]),`MOBILE_REQUIRED_NATIVE_DEP_MISSING:${key}`);
  }
  requireCheck(expo.updates?.url===`https://u.expo.dev/${expo.extra?.eas?.projectId}` &&
    expo.updates?.checkAutomatically==='ON_LOAD',
    'MOBILE_EAS_UPDATES_OR_PROJECT_CHANGED');
  requireCheck(eas.build?.production?.channel==='production' &&
    eas.build?.production?.autoIncrement===true &&
    eas.build?.production?.android?.buildType==='app-bundle',
    'MOBILE_PRODUCTION_BUILD_PROFILE_UNSAFE');
  requireCheck(eas.build?.['production-local']?.extends==='production',
    'MOBILE_LOCAL_STORE_BUILD_PROFILE_UNSAFE');
  return errors;
}

/** Run before the first production OTA network request.
 * New runtime 1.7.3 must NOT receive OTA until an actual store binary with
 * matching native code has been published on both iOS + Android. Preview
 * channel is intentionally exempt; it must use its own preview binary. */
export function validateOtaPublishAttestation({ channel, expoVersion, env }) {
  if(channel!=='production') return [];
  const errors=[];
  if(env.GAFUS_MOBILE_NATIVE_STORES_PUBLISHED!=='true')
    errors.push('MOBILE_OTA_PRODUCTION_REQUIRES_BOTH_STORES_PUBLISHED');
  if(env.GAFUS_MOBILE_NATIVE_PUBLISHED_VERSION!==expoVersion)
    errors.push('MOBILE_OTA_PUBLISHED_VERSION_MUST_MATCH_RUNTIME');
  return errors;
}

export function parseOtaChannel(argv) {
  for(let i=0;i<argv.length;i++) {
    if(argv[i]==='--channel') return argv[i+1] ?? '';
    if(argv[i].startsWith('--channel=')) return argv[i].slice('--channel='.length);
  }
  return '';
}
