/** Route Expo Observe native crash reports exclusively to the GAFUS API.
 * This runs for every native build, including when diagnostics are disabled:
 * without a baked-in endpoint Expo Observe defaults to Expo's own servers.
 * Endpoint is compiled into native code. OTA cannot change it. */
const path = require('node:path');
const PROJECT_ID='6c36fab5-6226-450f-8ee5-64e9beeea7db';
const API_ORIGIN='https://api.gafus.ru';
const ENDPOINT=API_ORIGIN+'/api/v1/telemetry/observe';

function withGafusNativeCrashCapture(config,env=process.env,options={}) {
  if(config?.extra?.eas?.projectId!==PROJECT_ID)
    throw Error('NATIVE_CRASH_EXPO_PROJECT_MISMATCH');
  if(!/^\d+\.\d+\.\d+$/.test(config.version||''))
    throw Error('NATIVE_CRASH_APP_VERSION_INVALID');
  const locate=options.resolveObservePackage || (()=>
    require.resolve('expo-observe/package.json',{paths:[path.resolve(__dirname,'..')]}));
  let manifest;
  try{
    const pkg=locate();
    if(typeof pkg!=='string'||!pkg.endsWith('/expo-observe/package.json'))
      throw Error('INVALID_PACKAGE_PATH');
    manifest=(options.packageMetadata??(()=>require(pkg)))();
  }catch{throw Error('NATIVE_CRASH_EXPO_OBSERVE_REQUIRED');}
  const version=manifest.version;
  const parts=typeof version==='string'?version.split('.').map(Number):[];
  if(parts.length!==3||parts[0]!==57||parts[1]!==0||parts[2]<21)
    throw Error('NATIVE_CRASH_EXPO_OBSERVE_57_0_21_REQUIRED');

  if(env.EXPO_PUBLIC_TELEMETRY_ENABLED==='true') {
    if(!['production','preview'].includes(env.APP_ENV))
      throw Error('NATIVE_CRASH_EXPLICIT_ENVIRONMENT_REQUIRED');
    if(env.GAFUS_OTA_TRANSPORT==='self-hosted' &&
      (config.extra?.otaEnvironment!==env.APP_ENV ||
       config.extra?.otaTransport!=='self-hosted' ||
       config.extra?.otaChannel!==env.APP_ENV))
      throw Error('NATIVE_CRASH_SIGNED_RUNTIME_MISMATCH');
    if(env.EXPO_PUBLIC_API_BASE_URL!==API_ORIGIN)
      throw Error('NATIVE_CRASH_API_ORIGIN_MISMATCH');
  }
  // No configurable external/Expo destination, no DSN or auth secrets in app.
  return {...config,extra:{...config.extra,
    nativeCrashSink:'gafus-uptrace',
    eas:{...config.extra.eas,observe:{endpointUrl:ENDPOINT}},
  }};
}
module.exports={withGafusNativeCrashCapture,ENDPOINT};
