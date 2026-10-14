/**
 * Fail-closed GitHub production release gate for Beget/CDNvideo.
 * --plan is offline/non-secret. --check validates protected runner environment
 * BEFORE any production image publishing, Cloud.ru API writes or VPS access.
 * It does not disclose signing keys, origin secrets or API tokens.
 * Read-only signed edge smoke is a separate mandatory job step.
 */
const mode = process.argv[2] ?? '--plan';
if (!['--plan', '--check'].includes(mode) || process.argv.length > 3)
  throw Error('BEGET_INVALID_RELEASE_ACTION');
const requiredVars = {
  GAFUS_MEDIA_CDN_TARGET: 'beget',
  BEGET_CDN_RELEASE_CONFIRM: 'reviewed-gallery-feed-beget-cutover',
  BEGET_CDN_PURGE_API_VERIFIED: 'true',
  BEGET_CDN_CACHE_KEY_VERIFIED: 'true',
  BEGET_CDN_PURGE_PROPAGATION_VERIFIED: 'true',
  BEGET_CDN_LIVE_SMOKE_VERIFIED: 'true',
  GALLERY_BEGET_CDN_SERVICE_ID: '0a8e97d5-3a65-4e90-99a6-c7f61131a461',
  FEED_BEGET_CDN_SERVICE_ID: 'becd9e5d-4fa8-47da-878c-9b80ded74e71',
};
const requiredKeys = ['GALLERY_CDN_SECRET', 'FEED_CDN_SECRET',
  'GALLERY_ORIGIN_SECRET', 'FEED_ORIGIN_SECRET', 'BEGET_CDN_API_TOKEN'];
const fixtures = [
  ['BEGET_GALLERY_SMOKE_FINAL_KEY', 'BEGET_GALLERY_SMOKE_SHA256',
    /^albums\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/photos\/[A-Za-z0-9_-]{1,128}\/(?:thumb|full)\.webp$/],
  ['BEGET_FEED_SMOKE_FINAL_KEY', 'BEGET_FEED_SMOKE_SHA256',
    /^posts\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/attachments\/[A-Za-z0-9_-]{1,128}\/(?:thumb|full|poster)\.webp$/],
];
if (mode === '--plan') {
  console.log(JSON.stringify({mode, mutates: false, provider: 'beget-only',
    storage: 'private-cloudru-s3', checks: [
      'approved-production-vars', 'existing-production-secrets-not-rotated',
      'purge-token-and-verified-beget-service-ids',
      'read-only-smoke-final-object-keys-and-digests',
      'no-yandex-cdn-fallback',
    ]}));
  process.exit(0);
}
if (process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.GITHUB_EVENT_NAME !== 'push' && process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch')
  throw Error('BEGET_RELEASE_BRANCH_UNAUTHORIZED');
for (const [name, expected] of Object.entries(requiredVars))
  if (process.env[name] !== expected) throw Error(`BEGET_RELEASE_GATE_MISSING_${name}`);
for (const name of requiredKeys)
  if (!process.env[name]) throw Error(`BEGET_RELEASE_SECRET_MISSING_${name}`);
if (!/^[A-Za-z0-9_-]{24,128}$/.test(process.env.GALLERY_CDN_SECRET))
  throw Error('BEGET_GALLERY_SIGNING_FORMAT_INVALID');
if (!/^[A-Za-z0-9_-]{24,32}$/.test(process.env.FEED_CDN_SECRET))
  throw Error('BEGET_FEED_SIGNING_FORMAT_INVALID');
for (const name of ['GALLERY_ORIGIN_SECRET', 'FEED_ORIGIN_SECRET'])
  if (Buffer.byteLength(process.env[name], 'utf8') < 32)
    throw Error('BEGET_ORIGIN_SECRET_FORMAT_INVALID_' + name);
if (process.env.BEGET_CDN_API_TOKEN.length < 24)
  throw Error('BEGET_PURGE_API_CREDENTIAL_INVALID');
for (const [key, digest, pattern] of fixtures) {
  const objectKey = process.env[key] ?? '';
  if (!pattern.test(objectKey) || objectKey.includes('/staging/') ||
      objectKey.includes('__gafus_cloudru_validation__') ||
      !/^[0-9a-f]{64}$/.test(process.env[digest] ?? ''))
    throw Error(`BEGET_SMOKE_FIXTURE_MISSING_${key}`);
}
console.log('BEGET_ONLY_READINESS=PASS (signed CDN/Origin read-only smoke still required)');
