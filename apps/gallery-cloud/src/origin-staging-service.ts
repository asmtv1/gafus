/**
 * Staging-only Cloud.ru origin to verify Cloud S3, HTTPS and CDN controls.
 * NEVER serve real owners: only opaque synthetic keys under the reserved owner.
 * After the signed CDN HIT gate passes, use the separately built production origin.
 */
import { createGalleryObjectStore } from '@gafus/gallery-storage/objects';
import { createGalleryOrigin } from './origin-handler.js';
import { constantTimeEqual } from '@gafus/gallery-storage/cdn';
import { createOriginHttpServer } from './origin-http.js';

if (process.env.GAFUS_STAGING_ORIGIN_MODE !== 'validation-only' ||
    process.env.GALLERY_BUCKET !== 'gafus-gallery-private' ||
    process.env.GALLERY_S3_ENDPOINT !== 'https://s3.cloud.ru')
  throw new Error('GALLERY_STAGING_ORIGIN_CONFIGURATION_REQUIRED');
const allowed = /^\/albums\/__gafus_cloudru_validation__\/staging\/photos\/[a-f0-9-]{36}\/(?:thumb|full)\.webp$/;
const serve = createGalleryOrigin({
  objects: createGalleryObjectStore({
    bucket: process.env.GALLERY_BUCKET,
    endpoint: process.env.GALLERY_S3_ENDPOINT,
    accessKeyId: process.env.GALLERY_S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.GALLERY_S3_SECRET_ACCESS_KEY ?? '',
  }),
  secret: process.env.GALLERY_ORIGIN_SECRET ?? '',
});
// Live transport diagnostics only in the synthetic staging image.
// Counters deliberately contain no user identity, token, object path, or IP.
const observations = { received: 0, completed: 0, status: {} as Record<number, number>, slowOver4500: 0, maxMs: 0 };
const server = createOriginHttpServer(async event => {
  const raw = event.url?.split('?')[0] ?? event.path ?? '';
  if (raw === '/__gafus_cloudru_validation__/metrics') {
    const allHeaders = Object.fromEntries(Object.entries(event.headers ?? {}).map(([key,value])=>[key.toLowerCase(),value]));
    if (!constantTimeEqual(allHeaders['x-gallery-origin-secret'] ?? '', process.env.GALLERY_ORIGIN_SECRET ?? ''))
      return { statusCode: 403, headers: { 'Cache-Control': 'no-store' } as Record<string,string>, body: '' };
    return { statusCode: 200, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' } as Record<string,string>, body: JSON.stringify(observations) };
  }
  if (!allowed.test(raw))
    return Promise.resolve({ statusCode: 404, headers: { 'Cache-Control': 'no-store' }, body: '' });
  const start = Date.now();
  observations.received++;
  let result;
  try { result = await serve(event); }
  finally {
    const elapsed = Date.now() - start;
    observations.completed++;
    observations.maxMs = Math.max(observations.maxMs, elapsed);
    if (elapsed > 4500) observations.slowOver4500++;
  }
  observations.status[result.statusCode] = (observations.status[result.statusCode] ?? 0) + 1;
  // Synthetic-only cache probe. All real user paths are denied above.
  // Cacheability must be tested without exposing user media or changing
  // the fail-closed Cache-Control policy of the production Origin.
  if (result.statusCode === 200 || result.statusCode === 206) {
    const { Pragma: _pragma, ...headers } = result.headers;
    return { ...result, headers: { ...headers, 'Cache-Control': 'public, max-age=600' } };
  }
  return result;
});
const port = Number(process.env.PORT ?? '8080');
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_PORT');
server.listen(port, '0.0.0.0');
process.on('SIGTERM', () => server.close());
