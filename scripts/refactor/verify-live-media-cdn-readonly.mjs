/** Read-only Cloud.ru/Beget production-like smoke over historical Refactor WORK DB keys.
 * Does not upload, download to disk, mutate CDN, change DB, or expose signed URLs.
 */
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { signGalleryCdnUrl } from '../../packages/gallery-storage/dist/cdn.js';
import { signFeedCdnUrl } from '../../packages/feed-storage/dist/storage.js';
import localCdn from '../../packages/cdn-upload/dist/localReadonlyCdn.js';
const { localReadonlyCdnSecret } = localCdn;
const root = '/Users/asmtv1/Desktop/gafus-refactor';
if (process.argv.length !== 2 || process.cwd() !== root || realpathSync(root) !== root)
  throw Error('READONLY_CDN_SMOKE_OUTSIDE_PROJECT');
const isolated = { NODE_ENV: 'development', GAFUS_LOCAL_ISOLATED_API: '1',
  GAFUS_ISOLATED_NONPROD_S3: 'enabled', GAFUS_LOCAL_READONLY_CDN: 'enabled',
  CLOUDRU_MEDIA_JOBS_ENABLED: 'false', GALLERY_MEDIA_FALLBACK_ENABLED: 'false',
  FEED_MEDIA_FALLBACK_ENABLED: 'false' };
let gallerySecret, feedSecret;
try {
  gallerySecret = localReadonlyCdnSecret('gallery', isolated);
  feedSecret = localReadonlyCdnSecret('feed', isolated);
} catch { console.error('LIVE_CDN_SIGNING_SECRETS_NOT_CONFIGURED'); process.exit(2); }
const dbFile = root + '/.local-pg-scratch/production_snapshot_20261024/app.env';
if (lstatSync(dbFile).isSymbolicLink() || (lstatSync(dbFile).mode & 0o777) !== 0o600)
  throw Error('READONLY_CDN_UNSAFE_DB_CONFIG');
const line = readFileSync(dbFile, 'utf8').trim();
if (!line.startsWith('DATABASE_URL=')) throw Error('READONLY_CDN_INVALID_DB_CONFIG');
const db = new URL(line.slice(13).replace(/^['"]|['"]$/g, ''));
if (db.protocol !== 'postgresql:' || db.hostname !== '127.0.0.1' || db.port !== '55921' ||
    db.pathname !== '/gafus_refactor_real_work_20261024' ||
    db.username !== 'gafus_refactor_local_real' || !db.password ||
    db.search !== '?schema=public') throw Error('READONLY_CDN_DB_ISOLATION_DENIED');
const safeQuery = sql => execFileSync('/opt/homebrew/bin/psql',
  ['-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    cwd: root, timeout: 6000, encoding: 'utf8', maxBuffer: 1024,
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', PGHOST: '127.0.0.1', PGPORT: '55921',
      PGDATABASE: 'gafus_refactor_real_work_20261024', PGUSER: db.username,
      PGPASSWORD: decodeURIComponent(db.password), PGOPTIONS: '-c default_transaction_read_only=on' },
  }).trim();
const galleryKey = safeQuery(`SELECT "thumbKey" FROM "GalleryPhoto" WHERE status='ready' AND "deletedAt" IS NULL AND "thumbKey" IS NOT NULL LIMIT 1`);
const photoKey = safeQuery(`SELECT "thumbKey" FROM "FeedMediaAsset" WHERE kind='photo' AND status='ready' AND "thumbKey" IS NOT NULL LIMIT 1`);
const playlistKey = safeQuery(`SELECT "playlistKey" FROM "FeedMediaAsset" WHERE kind='video' AND status='ready' AND "playlistKey" IS NOT NULL LIMIT 1`);
const segmentKey = safeQuery(`SELECT "videoSegmentKeys"[1] FROM "FeedMediaAsset" WHERE kind='video' AND status='ready' AND array_length("videoSegmentKeys",1)>0 LIMIT 1`);
if (![galleryKey, photoKey, playlistKey, segmentKey].every(Boolean)) throw Error('LIVE_CDN_MEDIA_DB_SAMPLES_MISSING');
const ttl = new Date(Date.now() + 110_000);
const now = Date.now();
const samples = [
  { name: 'gallery-webp', url: signGalleryCdnUrl('https://fupiquafifeswu.begetcdn.cloud', galleryKey, ttl, gallerySecret, now, 'beget'), type: 'image' },
  { name: 'feed-webp', url: signFeedCdnUrl('https://garaquachegasourn.begetcdn.cloud', photoKey, ttl, feedSecret, now, 'beget'), type: 'image' },
  { name: 'hls-playlist', url: signFeedCdnUrl('https://garaquachegasourn.begetcdn.cloud', playlistKey, ttl, feedSecret, now, 'beget'), type: 'hls' },
  { name: 'hls-segment', url: signFeedCdnUrl('https://garaquachegasourn.begetcdn.cloud', segmentKey, ttl, feedSecret, now, 'beget'), type: 'segment' },
];
await Promise.all(samples.map(async sample => {
  try {
    const r = await fetch(sample.url, { method: 'GET', redirect: 'error', cache: 'no-store',
      headers: { Origin: 'http://127.0.0.1:5173', ...(sample.type === 'segment' ? {Range: 'bytes=0-255'} : {}) },
      signal: AbortSignal.timeout(8500) });
    if (r.status !== (sample.type === 'segment' ? 206 : 200)) throw Error('BAD_HTTP_' + r.status);
    const cors = r.headers.get('access-control-allow-origin');
    if (sample.type !== 'image' && cors !== '*' && cors !== 'http://127.0.0.1:5173') throw Error('HLS_CORS_MISSING');
    const declared = Number(r.headers.get('content-length'));
    const limit = sample.type === 'image' ? 10 * 1024 * 1024 : sample.type === 'hls' ? 65536 : 256;
    if (r.headers.has('content-length') && (!Number.isSafeInteger(declared) || declared < 1 || declared > limit)) throw Error('INVALID_MEDIA_LENGTH');
    let size = 0; const chunks = [];
    const reader = r.body?.getReader(); if (!reader) throw Error('EMPTY_MEDIA_BODY');
    try { for (;;) { const packet = await reader.read(); if (packet.done) break;
      size += packet.value.byteLength; if (size > limit) { await reader.cancel(); throw Error('MEDIA_TOO_LARGE'); }
      chunks.push(packet.value); } } finally { reader.releaseLock(); }
    const bytes = Buffer.concat(chunks.map(x => Buffer.from(x)));
    if (!bytes.length) throw Error('EMPTY_MEDIA_BODY');
    if (sample.type === 'image' && (bytes.toString('ascii',0,4) !== 'RIFF' || bytes.toString('ascii',8,12) !== 'WEBP')) throw Error('INVALID_WEBP');
    if (sample.type === 'hls' && (!bytes.toString('utf8').startsWith('#EXTM3U') || !bytes.toString('utf8').includes('segment-'))) throw Error('INVALID_HLS');
    if (sample.type === 'segment' && bytes[0] !== 0x47) throw Error('INVALID_MPEG_TS');
    console.log('LIVE_MEDIA_CDN_PASS', sample.name, 'http='+r.status, 'bytes='+bytes.length);
  } catch (e) {
    // Suppress fetch errors (which may contain full signed URLs) and all private keys.
    const safe = String(e?.message ?? '').match(/^(?:BAD_HTTP_\d{3}|HLS_CORS_MISSING|INVALID_MEDIA_LENGTH|MEDIA_TOO_LARGE|EMPTY_MEDIA_BODY|INVALID_WEBP|INVALID_HLS|INVALID_MPEG_TS)$/)?.[0];
    const reason = safe ?? (e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_OR_TLS');
    console.error('LIVE_MEDIA_CDN_FAILED',sample.name,reason);
    process.exitCode = 1;
  }
}));
