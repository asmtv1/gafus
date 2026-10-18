/** Read-only production gate for the isolated Questions CDN; no S3 writes. */
export const QUESTIONS_CDN = {
  id: '3c2a1623-50a1-46a1-b7a4-bb1093eaedf0',
  hostname: 'ebiteskukingusk.begetcdn.cloud',
  origin: 'gafus-questions-public.s3.cloud.ru',
  bucket: 'gafus-questions-public',
};

export function checkQuestionsCdnSettings(env = process.env) {
  const enabled = env.QUESTIONS_PUBLIC_S3_ENABLED ?? 'true';
  if (!['true', 'false'].includes(enabled)) throw new Error('QUESTIONS_INVALID_CUTOVER_SETTING');
  if (enabled === 'false') return false; // Rollback uses the existing private route.
  if (env.QUESTIONS_CLOUD_JOB_ENABLED !== 'true' ||
      env.QUESTIONS_PROCESSOR_READY !== 'true')
    throw new Error('QUESTIONS_PROCESSOR_NOT_READY');
  if (env.QUESTIONS_CDN_LIVE_VERIFIED !== 'true' ||
      env.QUESTIONS_PUBLIC_S3_BUCKET !== QUESTIONS_CDN.bucket ||
      env.QUESTIONS_CDN_BASE_URL !== 'https://' + QUESTIONS_CDN.hostname ||
      env.QUESTIONS_BEGET_CDN_SERVICE_ID !== QUESTIONS_CDN.id)
    throw new Error('QUESTIONS_CDN_DEPLOY_SETTINGS_MISMATCH');
  if (!env.BEGET_CDN_API_TOKEN || env.BEGET_CDN_API_TOKEN.length < 24)
    throw new Error('QUESTIONS_CDN_API_TOKEN_MISSING');
  return true;
}

export function checkQuestionsCdnApiResponse(value) {
  const service = value?.service;
  if (service?.id !== QUESTIONS_CDN.id ||
      service.display_name !== 'GAFUS Questions CDN' ||
      service.status !== 'RUNNING' ||
      service.cdn?.source_domain?.domain !== QUESTIONS_CDN.origin ||
      service.cdn.source_domain.source_protocol !== 'HTTPS' ||
      service.cdn.ssl_enabled !== true ||
      !service.cdn.resource_domain?.some(entry =>
        entry.domain === QUESTIONS_CDN.hostname && entry.status === 'WORKING'))
    throw new Error('QUESTIONS_CDN_NOT_READY');
}

/** Called on main-push and manual reusable deploy before any SSH, image push or storage mutation. */
export async function checkQuestionsCdnReadiness(env = process.env, fetcher = fetch) {
  if (!checkQuestionsCdnSettings(env)) return 'disabled';
  const response = await fetcher('https://api.beget.com/v1/cloud/' + QUESTIONS_CDN.id, {
    headers: { Authorization: 'Bearer ' + env.BEGET_CDN_API_TOKEN },
    redirect: 'error',
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error('QUESTIONS_CDN_PREFLIGHT_HTTP_' + response.status);
  checkQuestionsCdnApiResponse(await response.json());
  return 'ready';
}

if (process.argv[1]?.endsWith('/questions-public-readiness.mjs')) {
  checkQuestionsCdnReadiness().then(result => console.log('QUESTIONS_CDN_READONLY_PREFLIGHT=' + result))
    .catch(error => {
      console.error('QUESTIONS_CDN_PREFLIGHT_BLOCKED', error instanceof Error ? error.message : 'UNKNOWN');
      process.exitCode = 1;
    });
}
