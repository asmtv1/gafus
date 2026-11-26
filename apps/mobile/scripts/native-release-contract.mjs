/**
 * Native binary / EAS Update compatibility checks. Source-only, no network,
 * keystore, provider API, native build or production secrets.
 *
 * A new native module MUST NOT share the old SDK-wide OTA runtime. Expo SDK 55
 * explicitly supports appVersion runtime isolation for this use case.
 */
export const minimumStoreRelease = '1.7.4';
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
  // SDK57 keeps the full-bleed startup poster on tall displays. Older SDK55
  // release profiles retain their previous contain policy.
  const sdk57=/^57\./.test(mobilePackage.dependencies?.expo ?? '');
  // Expo SDK 57 accepts splash configuration only via the expo-splash-screen
  // config plugin. Deprecated splash/ios.splash/android.splash fail Expo Doctor.
  const splashPlugin=expo.plugins?.find(p=>Array.isArray(p) && p[0]==='expo-splash-screen');
  const splashConfig=splashPlugin?.[1];
  const splashValid=sdk57 ? (
    !expo.splash && !expo.ios?.splash && !expo.android?.splash &&
    splashConfig?.resizeMode==='cover' && splashConfig?.ios?.resizeMode==='cover' &&
    splashConfig?.ios?.enableFullScreenImage_legacy===true &&
    splashConfig?.image==='./assets/images/startup-splash.png' &&
    splashConfig?.ios?.image==='./assets/images/startup-splash.png' &&
    splashConfig?.backgroundColor==='#B5E5EB'
  ) : (expo.splash?.resizeMode==='contain' && expo.ios?.splash?.resizeMode==='contain');
  requireCheck(splashValid,'MOBILE_SPLASH_MUST_FIT_SCREEN');
  const plugins=(expo.plugins ?? []).map(p=>typeof p==='string'?p:p?.[0]);
  for(const key of ['expo-video','expo-image-picker','expo-notifications','expo-secure-store']) {
    requireCheck(plugins.includes(key),`MOBILE_REQUIRED_NATIVE_PLUGIN_MISSING:${key}`);
  }
  for(const key of ['react-native-compressor','react-native-gesture-handler',
    'react-native-reanimated','expo-updates']) {
    requireCheck(Boolean(mobilePackage.dependencies?.[key]),`MOBILE_REQUIRED_NATIVE_DEP_MISSING:${key}`);
  }
  requireCheck(!expo.updates?.url && expo.updates?.enabled===false &&
    expo.updates?.checkAutomatically==='NEVER',
    'MOBILE_OTA_UNCONFIGURED_BASE_MUST_BE_DISABLED');
  requireCheck(eas.build?.production?.channel==='production' &&
    eas.build?.production?.autoIncrement===false &&
    eas.build?.production?.env?.GAFUS_OTA_TRANSPORT==='self-hosted' &&
    eas.build?.production?.android?.buildType==='app-bundle',
    'MOBILE_PRODUCTION_BUILD_PROFILE_UNSAFE');
  requireCheck(eas.build?.['production-local']?.extends==='production',
    'MOBILE_LOCAL_STORE_BUILD_PROFILE_UNSAFE');
  for (const [name, profile] of Object.entries(eas.build ?? {})) {
    if (profile.developmentClient === true) continue;
    const transport = profile.env?.GAFUS_OTA_TRANSPORT ??
      eas.build?.[profile.extends]?.env?.GAFUS_OTA_TRANSPORT ??
      eas.build?.[eas.build?.[profile.extends]?.extends]?.env?.GAFUS_OTA_TRANSPORT;
    requireCheck(transport === 'self-hosted', 'MOBILE_RELEASE_PROFILE_REQUIRES_SELF_HOSTED:'+name);
  }
  return errors;
}

/** Run before the first production OTA network request.
 * New runtime 1.7.4 must NOT receive OTA until an actual store binary with
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

/** Resolve target without substring checks: --channel=production and spaced form are equal. */
export function resolveEasUpdateTarget(argv) {
  const read = (flag) => {
    const choices=[];
    for (let i=0;i<argv.length;i++) {
      if (argv[i]===flag) choices.push(argv[i+1] ?? '');
      else if (argv[i].startsWith(`${flag}=`)) choices.push(argv[i].slice(flag.length+1));
    }
    if (choices.length > 1 || choices.some(v=>!v || v.startsWith('--')))
      throw Error('MOBILE_OTA_TARGET_AMBIGUOUS');
    return choices[0] ?? '';
  };
  const channel=read('--channel');
  const branch=read('--branch');
  const environment=read('--environment');
  if ((channel && branch) || (!channel && !branch) || (branch && branch!=='main'))
    throw Error('MOBILE_OTA_TARGET_AMBIGUOUS');
  const targetChannel=channel || 'production';
  if (!['preview','production'].includes(targetChannel))
    throw Error('MOBILE_OTA_TARGET_UNSUPPORTED');
  if (environment && environment!==targetChannel)
    throw Error('MOBILE_OTA_CHANNEL_ENVIRONMENT_MISMATCH');
  return { channel:targetChannel, environment:environment || targetChannel, viaBranch:!!branch };
}

export function parseOtaChannel(argv) {
  for(let i=0;i<argv.length;i++) {
    if(argv[i]==='--channel') return argv[i+1] ?? '';
    if(argv[i].startsWith('--channel=')) return argv[i].slice('--channel='.length);
  }
  return '';
}
