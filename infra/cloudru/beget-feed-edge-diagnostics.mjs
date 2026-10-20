/** Manual read-only, cross-origin Feed CDN diagnosis from the protected CI runner.
 * Never prints tokens, object paths, signed URLs, request bodies or provider configs.
 */
import { createHash } from 'node:crypto';

const env = process.env;
if (process.argv.length !== 3 || process.argv[2] !== '--check')
  throw Error('DIAGNOSTIC_CHECK_ONLY');
if (env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch')
  throw Error('DIAGNOSTIC_GUARD');
const host = 'https://quepraquiecebquomiel.begetcdn.cloud';
const id = 'cbb7fe86-a193-457e-a756-9cf3aa2aef1b';
const key = env.BEGET_FEED_SMOKE_FINAL_KEY || '';
const digest = env.BEGET_FEED_SMOKE_SHA256 || '';
if (env.FEED_CDN_BASE_URL !== host || env.FEED_BEGET_CDN_SERVICE_ID !== id ||
    !/^posts\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/attachments\/[A-Za-z0-9_-]+\/poster\.webp$/.test(key) ||
    !/^[a-f0-9]{64}$/.test(digest) || !env.BEGET_CDN_API_TOKEN)
  throw Error('DIAGNOSTIC_EXPECTED_CONFIG_MISSING');
const safeHeader = (headers, name) => (headers.get(name) || '').slice(0, 120);
async function request(label, url, method = 'GET', headers = {}) {
  try {
    const res = await fetch(url, { method, headers, redirect: 'manual',
      cache: 'no-store', signal: AbortSignal.timeout(16_000) });
    const content = method === 'HEAD' ? Buffer.alloc(0) : Buffer.from(await res.arrayBuffer());
    const actual = content.length && res.status === 200 ? createHash('sha256').update(content).digest('hex') : null;
    const report = { label, method, status: res.status,
      edge: safeHeader(res.headers, 'x-cdn-edge-id'),
      cache: safeHeader(res.headers, 'x-cdn-edge-cache'),
      contentType: safeHeader(res.headers, 'content-type'),
      cacheControl: safeHeader(res.headers, 'cache-control'),
      bytes: content.length, digestMatches: actual === null ? null : actual === digest };
    console.log('READ_ONLY_ORIGIN_PROBE', JSON.stringify(report));
    return report;
  } catch (error) {
    console.log('READ_ONLY_ORIGIN_PROBE',JSON.stringify({label,method,error:error.name,
      transportCode:error.cause?.code || ''}));
    return null;
  }
}
const path = `/${key}`;
for (const method of ['GET', 'HEAD', 'GET'])
  await request('public_feed_cdn', host + path, method);
await request('public_cloudru_s3_path', 'https://s3.cloud.ru/gafus-feed-private' + path);
try {
  const res = await fetch(`https://api.beget.com/v1/cloud/${id}`, {
    headers: { Authorization: `Bearer ${env.BEGET_CDN_API_TOKEN}` },
    redirect: 'error', signal: AbortSignal.timeout(16_000),
  });
  const result = res.ok ? await res.json() : null;
  console.log('READ_ONLY_BEGET_SERVICE',JSON.stringify({ status:res.status,
    topLevelFields: result && typeof result === 'object' ? Object.keys(result).slice(0,25) : [] }));
  if (result && typeof result === 'object') {
    for (const name of ['cloud','service','cdn','configuration','settings']) {
      const obj = result[name];
      if (!obj || typeof obj !== 'object') continue;
      console.log('READ_ONLY_BEGET_STRUCTURE',JSON.stringify({field:name,fields:Object.keys(obj).slice(0,35)}));
      for (const key of ['cdn','settings','configuration','source_params']) {
        if (obj[key] && typeof obj[key] === 'object')
          console.log('READ_ONLY_BEGET_NESTED_FIELDS',JSON.stringify({field:name+'.'+key,
            fields:Object.keys(obj[key]).slice(0,35)}));
      }
    }
  }
} catch (error) {
  console.log('READ_ONLY_BEGET_SERVICE',JSON.stringify({error:error.name,
    transportCode:error.cause?.code || ''}));
}
