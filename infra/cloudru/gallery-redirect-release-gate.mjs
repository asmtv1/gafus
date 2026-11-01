/** Fail-closed, read-only Beget Gallery -> Hono 307 -> private S3 release preflight.
 * Does not change Beget, Cloud.ru, GitHub secrets or any user objects.
 */
const newService = '96cd124e-767e-4af1-a568-c4d1f9b4e73f';
const newHost = 'fupiquafifeswu.begetcdn.cloud';
const requireTrue = (env, name) => {
  if (env[name] !== 'true') throw Error('GALLERY_REDIRECT_GATE_' + name);
};
export function checkGalleryRedirectConfig(env) {
  for (const name of ['GALLERY_CDN_ORIGIN_ROUTE_ENABLED', 'GALLERY_CDN_REDIRECT_ENABLED',
    'GALLERY_CDN_CACHEABLE_FINAL_ENABLED']) {
    if (env[name] && !['true','false'].includes(env[name])) throw Error('GALLERY_REDIRECT_GATE_INVALID_' + name);
  }
  const origin = env.GALLERY_CDN_ORIGIN_ROUTE_ENABLED === 'true';
  const redirect = env.GALLERY_CDN_REDIRECT_ENABLED === 'true';
  if (env.GALLERY_CDN_REDIRECT_REQUIRED === 'true' && (!origin || !redirect))
    throw Error('GALLERY_REDIRECT_GATE_REQUIRED');
  if (!origin && !redirect) return { enabled: false };
  requireTrue(env,'GALLERY_CDN_ORIGIN_ROUTE_ENABLED');
  requireTrue(env,'GALLERY_CDN_EDGE_TOKEN_VERIFIED');
  requireTrue(env,'BEGET_CDN_PURGE_API_VERIFIED');
  requireTrue(env,'BEGET_CDN_CACHE_KEY_VERIFIED');
  requireTrue(env,'BEGET_CDN_PURGE_PROPAGATION_VERIFIED');
  for (const name of ['GALLERY_CDN_REDIRECT_ORIGIN_SECRET', 'GALLERY_CDN_REDIRECT_SIGNING_SECRET']) {
    const regex = name.endsWith('ORIGIN_SECRET') ? /^[A-Za-z0-9]{32,128}$/ : /^[A-Za-z0-9_-]{24,128}$/;
    if (!regex.test(env[name] ?? '')) throw Error('GALLERY_REDIRECT_GATE_MISSING_' + name);
  }
  // The retired Gallery CDN is never an approved release target.
  if (env.GALLERY_BEGET_CDN_SERVICE_ID !== newService ||
      (env.BEGET_CDN_API_TOKEN ?? '').length < 24)
    throw Error('GALLERY_REDIRECT_GATE_SERVICE');
  if (redirect) {
    requireTrue(env,'GALLERY_CDN_CACHEABLE_FINAL_ENABLED');
    requireTrue(env,'GALLERY_CDN_REDIRECT_S3_SMOKE_VERIFIED');
    requireTrue(env,'GALLERY_CDN_BROWSER_CACHE_VERIFIED');
    requireTrue(env,'GALLERY_CDN_METADATA_MIGRATED');
    if (env.GALLERY_CDN_BASE_URL !== `https://${newHost}`)
      throw Error('GALLERY_REDIRECT_GATE_BASE_URL');
  }
  return { enabled: true, redirect };
}
export async function checkGalleryRedirectProvider(env, fetcher = fetch) {
  const config = checkGalleryRedirectConfig(env);
  if (!config.enabled) return config;
  let response;
  try {
    response = await fetcher(`https://api.beget.com/v1/cloud/${newService}`, {
      method: 'GET', headers: { Authorization: `Bearer ${env.BEGET_CDN_API_TOKEN}`, Accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error('GALLERY_REDIRECT_GATE_BEGET_HTTP_' + response.status);
    const data = await response.json();
    const svc = data?.service; const cdn = svc?.cdn; const settings = cdn?.settings;
    if (svc?.status !== 'RUNNING' || cdn?.source_domain?.domain !== 'api.gafus.ru' ||
        cdn?.source_domain?.source_protocol !== 'HTTPS' ||
        !cdn?.resource_domain?.some(entry => entry.domain === newHost && entry.status === 'WORKING') ||
        settings?.follow_origin_redirect?.enable !== true ||
        settings?.tokenized_url_secure_key?.enable !== true ||
        settings?.static_request_headers?.enabled !== true ||
        !Number.isSafeInteger(settings?.caching_time) || settings.caching_time < 180 ||
        settings?.caching_time_browser?.enable !== false ||
        settings?.static_response_headers?.enable !== true ||
        !settings?.static_response_headers?.header?.some(header =>
          header.name?.toLowerCase() === 'cache-control' &&
          header.value?.includes('private, max-age=180, must-revalidate')))
      throw Error('GALLERY_REDIRECT_GATE_BEGET_SETTINGS');
    return { ...config, providerVerified: true };
  } finally { await response?.body?.cancel?.().catch(()=>{}); }
}
if (process.argv[1]?.endsWith('/gallery-redirect-release-gate.mjs')) {
  checkGalleryRedirectProvider(process.env)
    .then(out => console.log(out.enabled ? 'GALLERY_REDIRECT_GATE_PROVIDER_READONLY_PASS' : 'GALLERY_REDIRECT_GATE_OFF'))
    .catch(err => { console.error(err.message.startsWith('GALLERY_REDIRECT_GATE_')
      ? err.message : 'GALLERY_REDIRECT_GATE_PROVIDER_UNAVAILABLE'); process.exitCode = 1; });
}
