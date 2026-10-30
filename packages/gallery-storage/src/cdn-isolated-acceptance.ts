/** Fixed ephemeral QA-only S3 identity. Never active in production or shared WORK. */
export function cdnIsolatedAcceptance(env: Record<string,string|undefined> = process.env) {
  return env.NODE_ENV === 'test' && env.GAFUS_CDN_FULL_ISOLATED_ACCEPTANCE === '1' &&
    env.DATABASE_URL === 'postgresql://asmtv1@127.0.0.1:55446/cdn_agent2_qa' &&
    env.REDIS_URL === 'redis://127.0.0.1:56340' &&
    env.GAFUS_CDN_LOCAL_S3_ENDPOINT === 'http://127.0.0.1:58390' &&
    /^[A-Za-z0-9]{20,64}$/.test(env.GAFUS_CDN_LOCAL_S3_KEY ?? '') &&
    /^[A-Za-z0-9]{32,128}$/.test(env.GAFUS_CDN_LOCAL_S3_SECRET ?? '');
}
