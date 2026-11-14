/** Build-time Observe experiment gate. Never silently route native metrics to
 * Expo servers or enable production diagnostics without a signed native profile.
 * Must be called after self-hosted native release validation. */
function withObservePreviewExperiment(config, env = process.env, options = {}) {
  if (env.GAFUS_OBSERVE_EXPERIMENT !== 'true') return config;
  if (env.GAFUS_OTA_TRANSPORT !== 'self-hosted' ||
      config?.extra?.otaEnvironment !== 'preview' ||
      config?.extra?.otaTransport !== 'self-hosted' ||
      config?.extra?.otaChannel !== 'preview' ||
      !/^1\.8\.\d+$/.test(config.version ?? '') ||
      config.runtimeVersion?.policy !== 'appVersion') {
    throw new Error('OBSERVE_EXPERIMENT_REQUIRES_VERIFIED_SDK57_PREVIEW_RUNTIME');
  }
  const projectId = config.extra?.eas?.projectId;
  const nativeUrl = config.updates?.url;
  if (typeof projectId !== 'string' || !/^[a-f\d-]{36}$/i.test(projectId) ||
      typeof nativeUrl !== 'string') throw new Error('OBSERVE_EXPERIMENT_MISSING_NATIVE_ENDPOINT');
  let parsed;
  try { parsed = new URL(nativeUrl); }
  catch { throw new Error('OBSERVE_EXPERIMENT_INVALID_NATIVE_ENDPOINT'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.search || parsed.hash || parsed.pathname !== '/ota/manifest' ||
      parsed.hostname === 'gafus.ru') {
    throw new Error('OBSERVE_EXPERIMENT_INVALID_NATIVE_ENDPOINT');
  }
  // Uptrace/Observe must resolve to the same explicitly pinned GAFUS API
  // origin as mobile ingest. OTA CDN and API may use different domains.
  const apiOrigin = env.EXPO_PUBLIC_API_BASE_URL;
  if (typeof apiOrigin !== 'string')
    throw new Error('OBSERVE_EXPERIMENT_API_ORIGIN_REQUIRED');
  let api;
  try { api = new URL(apiOrigin); }
  catch { throw new Error('OBSERVE_EXPERIMENT_API_ORIGIN_INVALID'); }
  if (api.protocol !== 'https:' || api.username || api.password ||
      api.search || api.hash || !['','/'].includes(api.pathname) ||
      !['api.gafus.ru','api-preview.gafus.ru'].includes(api.hostname))
    throw new Error('OBSERVE_EXPERIMENT_API_ORIGIN_INVALID');
  // Expo Observe is a native autolinked SDK. The config alone cannot capture
  // crashes. Refuse to ship a preview that claims Observe is working while
  // expo-observe is absent; do not add it to the shared production dependency
  // tree until a release-safe opt-in native build pipeline is verified.
  const locate = options.resolveObservePackage || (() =>
    require.resolve('expo-observe/package.json', {paths: [require('path').resolve(__dirname, '..')]}));
  try {
    const filename = locate();
    if(typeof filename !== 'string' || !filename.endsWith('/expo-observe/package.json'))
      throw new Error('PACKAGE_MISMATCH');
  } catch {
    throw new Error('OBSERVE_EXPERIMENT_REQUIRES_EXPO_OBSERVE_NATIVE_DEPENDENCY');
  }
  const endpointUrl = api.origin + '/api/v1/telemetry/observe';
  const plugins = (config.plugins ?? []).filter(p =>
    (typeof p === 'string' ? p : p?.[0]) !== './plugins/withAppTracerNative');
  return {
    ...config,
    plugins,
    extra: {
      ...config.extra,
      observeExperiment: true,
      eas: {...config.extra.eas,observe:{endpointUrl}},
    },
  };
}
module.exports = {withObservePreviewExperiment};
