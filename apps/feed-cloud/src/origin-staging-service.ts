/** Synthetic-key-only stage; cannot serve published user attachments. */
import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { handler } from './origin.js';
if (process.env.GAFUS_STAGING_ORIGIN_MODE !== 'validation-only' ||
    process.env.FEED_BUCKET !== 'gafus-feed-private' ||
    process.env.FEED_S3_ENDPOINT !== 'https://s3.cloud.ru' ||
    Buffer.byteLength(process.env.FEED_ORIGIN_SECRET ?? '') < 32 ||
    (process.env.FEED_STAGING_GALLERY_SECRET !== undefined &&
     Buffer.byteLength(process.env.FEED_STAGING_GALLERY_SECRET) < 32))
  throw new Error('FEED_STAGING_ORIGIN_CONFIGURATION_REQUIRED');
const allowed = /^\/posts\/__gafus_cloudru_validation__\/staging\/attachments\/[a-f0-9-]{36}\/(?:poster\.webp|thumb\.webp|full\.webp|hls\/segment-[0-9]{3,5}\.ts)$/;
const port = Number(process.env.PORT ?? '8080');
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_PORT');
const observations = { received: 0, completed: 0, status: {} as Record<number, number>, slowOver4500: 0, maxMs: 0 };
const digest = (value: string) => createHash('sha256').update(value).digest();
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  const path = (req.url ?? '').split('?')[0];
  const originalHeaders = Object.fromEntries(Object.entries(req.headers).map(([k,v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v]));
  // The existing gallery-dev test CDN forwards x-gallery-origin-secret. For
  // THIS synthetic-only staging app, allow that independent secret to test
  // Feed images and TS segments without changing any CDN signing secrets.
  // This transport is never included in the regular production Feed image.
  const gallerySecret = process.env.FEED_STAGING_GALLERY_SECRET ?? '';
  const galleryAuthorized = gallerySecret.length >= 32 &&
    timingSafeEqual(digest(originalHeaders['x-gallery-origin-secret'] ?? ''),digest(gallerySecret));
  const feedSecret = process.env.FEED_ORIGIN_SECRET ?? '';
  const feedAuthorized = timingSafeEqual(digest(originalHeaders['x-feed-origin-secret'] ?? ''),digest(feedSecret));
  if (path === '/__gafus_cloudru_validation__/metrics') {
    if (!galleryAuthorized && !feedAuthorized) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200).end(req.method === 'HEAD' ? undefined : JSON.stringify(observations));
    return;
  }
  if (!allowed.test(path)) { res.writeHead(404).end(); return; }
  if (!feedAuthorized && !galleryAuthorized) { res.writeHead(403).end(); return; }
  const started = Date.now();
  observations.received++;
  try {
    const response = await handler({
      httpMethod: req.method,
      rawPath: path,
      headers: { ...originalHeaders, 'x-feed-origin-secret': feedSecret },
    });
    const elapsed = Date.now()-started;
    observations.completed++;
    observations.maxMs=Math.max(observations.maxMs,elapsed);
    if(elapsed>4500)observations.slowOver4500++;
    observations.status[response.statusCode]=(observations.status[response.statusCode]??0)+1;
    for (const [k,v] of Object.entries(response.headers ?? {})) res.setHeader(k, v);
    // Only synthetic UUID-owned final JPEG-derived WebP and TS files may be
    // shared-cached; 403, 404 and failure responses always stay no-store.
    if(response.statusCode===200 || response.statusCode===206)
      res.setHeader('Cache-Control','public, max-age=600');
    const body = ('isBase64Encoded' in response && response.isBase64Encoded) ? Buffer.from(response.body ?? '', 'base64') : Buffer.from(response.body ?? '', 'utf8');
    res.writeHead(response.statusCode).end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(503).end(); }
});
server.listen(port, '0.0.0.0');
process.on('SIGTERM', () => server.close());
