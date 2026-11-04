/**
 * Real MinIO S3 over disposable 127.0.0.1 endpoints, with verified official
 * source-built Go binary. Synthetic private credentials, random ports, own
 * temp data directory; no .env, Cloud.ru, user S3 data, existing containers.
 * Covers actual MinIO SigV4, GET/HEAD/Range/expiry/ACL, outage and recovery.
 * Does NOT cover application workers, queues or production CDN behaviour.
 *
 * node ci-cd/scripts/local-minio-real-s3.acceptance.mjs <absolute-binary-path>
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, openSync, closeSync, realpathSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const qaRoot = join(root, '.gafus-refactoring', 'architecture-qa-20261103-local');
const binary = process.argv[2] && realpathSync(process.argv[2]);
assert(binary && binary.startsWith(qaRoot + sep), 'MINIO_SOURCE_BINARY_OUTSIDE_OWN_QA_SCOPE');
assert(statSync(binary).isFile(), 'MINIO_SOURCE_BINARY_REQUIRED');
const build = spawnSync('go', ['version', '-m', binary], { encoding: 'utf8', timeout: 5000 });
assert.equal(build.status, 0, 'MINIO_GO_BUILD_METADATA_UNAVAILABLE');
assert.match(build.stdout, /path\s+github\.com\/minio\/minio/);
assert.match(build.stdout, /mod\s+github\.com\/minio\/minio\s+v0\.0\.0-20260212201848-7aac2a2c5b7c\s+h1:/);
const requirePackage = createRequire(join(root, 'packages/gallery-storage/package.json'));
const {
  S3Client, CreateBucketCommand, PutObjectCommand, GetObjectCommand,
  HeadObjectCommand, DeleteObjectCommand,
} = requirePackage('@aws-sdk/client-s3');
const { getSignedUrl } = requirePackage('@aws-sdk/s3-request-presigner');

const availableBytes = () => {
  const result = spawnSync('df', ['-k', root], { encoding: 'utf8', timeout: 3000 });
  assert.equal(result.status, 0);
  const lastLine = result.stdout.trim().split('\n').at(-1);
  return Number(lastLine.trim().split(/\s+/)[3]) * 1024;
};
assert(availableBytes() > 7 * 1024 ** 3, 'MINIO_DISK_HEADROOM_BELOW_7_GIB');
mkdirSync(qaRoot, { recursive: true });
const runDir = mkdtempSync(join(qaRoot, 'isolated-minio-run-'));
const dataDir = join(runDir, 'objects');
mkdirSync(dataDir);
const logFd = openSync(join(runDir, 'minio-runtime.log'), 'a');
const user = 'qa' + randomBytes(9).toString('hex');
const password = randomBytes(28).toString('hex');
const bucket = `gafus-private-synthetic-${randomUUID().slice(0, 12)}`;
const key = `albums/synthetic/photos/${randomUUID()}/full.webp`;
const bytes = Buffer.from('0123456789abcdef', 'ascii');
let child;
let client;

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
async function port() {
  const socket = createServer();
  await new Promise((ok, fail) => { socket.once('error', fail); socket.listen(0, '127.0.0.1', ok); });
  const address = socket.address();
  assert(address && typeof address !== 'string');
  await new Promise(ok => socket.close(ok));
  return address.port;
}
async function start(dataPort, consolePort) {
  assert(!child, 'SERVER_ALREADY_RUNNING');
  child = spawn(binary, ['server', dataDir,
    '--address', `127.0.0.1:${dataPort}`,
    '--console-address', `127.0.0.1:${consolePort}`], {
    cwd: runDir,
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: runDir, TMPDIR: runDir,
      MINIO_ROOT_USER: user, MINIO_ROOT_PASSWORD: password,
      MINIO_BROWSER: 'off', MINIO_UPDATE: 'off',
      MINIO_SITE_REGION: 'us-east-1', GOMAXPROCS: '2', GOMEMLIMIT: '512MiB',
    },
    stdio: ['ignore', logFd, logFd],
  });
  let ready = false;
  for (let i = 0; i < 70; i++) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${dataPort}/minio/health/live`, {
        signal: AbortSignal.timeout(750),
      });
      if (response.status === 200) { ready = true; break; }
    } catch { /* Not ready yet */ }
    await delay(250);
  }
  assert(ready, 'ISOLATED_MINIO_NOT_HEALTHY');
}
async function stop() {
  if (!child) return;
  const process = child;
  child = undefined;
  if (process.exitCode !== null) return;
  const done = new Promise(resolve => process.once('exit', resolve));
  process.kill('SIGTERM');
  await Promise.race([done, delay(3500)]);
  if (process.exitCode === null) {
    process.kill('SIGKILL');
    await Promise.race([done, delay(3500)]);
  }
  assert(process.exitCode !== null, 'OWN_MINIO_PROCESS_DID_NOT_EXIT');
}
try {
  const dataPort = await port();
  const consolePort = await port();
  assert(dataPort !== consolePort, 'TWO_DISTINCT_PORTS_REQUIRED');
  const endpoint = `http://127.0.0.1:${dataPort}`;
  await start(dataPort, consolePort);
  client = new S3Client({ endpoint, region: 'us-east-1', forcePathStyle: true,
    credentials: { accessKeyId: user, secretAccessKey: password },
    maxAttempts: 1, requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  // Exercise the actual GAFUS Gallery ObjectStore, not just AWS SDK HTTP:
  // byte limits, MD5, conditional writes, immutable retry and ownership keys.
  const galleryModule = await import(pathToFileURL(resolve(root, 'packages/gallery-storage/dist/objects.js')).href);
  const store = galleryModule.createGalleryObjectStore({
    bucket, endpoint, accessKeyId: user, secretAccessKey: password,
    isolatedNonprod: true, cacheableFinalEnabled: false,
  }, client);
  const adapterKey = `albums/qa-owner/qa-album/photos/${randomUUID()}/full.webp`;
  const first = await store.create(adapterKey, bytes, 'image/webp');
  assert.equal(first.bytes, bytes.length);
  const verified = await store.head(adapterKey);
  assert.equal(verified?.etag, first.etag);
  const snapshot = await store.read(adapterKey, first.etag);
  assert(Buffer.from(snapshot.bytes).equals(bytes));
  assert.equal((await store.create(adapterKey, bytes, 'image/webp')).etag,
    first.etag, 'REPLAY_MUST_VERIFY_IDENTICAL_IMMUTABLE_OBJECT');
  await assert.rejects(() => store.create(adapterKey, Buffer.from('different'), 'image/webp'),
    /IMMUTABLE_CONFLICT/, 'FOREIGN_IMMUTABLE_WRITE_MUST_NOT_OVERWRITE');
  assert(Buffer.from((await store.read(adapterKey, first.etag)).bytes).equals(bytes));
  await store.delete(adapterKey);
  assert.equal(await store.head(adapterKey), null);
  console.log('PASS REAL GAFUS GalleryObjectStore + MinIO: conditional create, HEAD, read ETag, identical retry, foreign conflict, delete');
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes,
    ContentType: 'image/webp' }));
  const signedGet = await getSignedUrl(client,
    new GetObjectCommand({ Bucket: bucket, Key: key,
      ResponseCacheControl: 'private, no-store' }), { expiresIn: 90 });
  const signedHead = await getSignedUrl(client,
    new HeadObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 90 });
  const anonymous = await fetch(`${endpoint}/${bucket}/${key}`);
  assert.equal(anonymous.status, 403, 'PRIVATE_BUCKET_MUST_DENY_ANONYMOUS_GET');
  const ranged = await fetch(signedGet, { headers: { Range: 'bytes=4-7' } });
  assert.equal(ranged.status, 206, 'MINIO_RANGED_GET_EXPECTED_206');
  assert.equal(ranged.headers.get('content-range'), 'bytes 4-7/16');
  assert.equal(ranged.headers.get('cache-control'), 'private, no-store');
  assert.equal(await ranged.text(), '4567');
  const invalid = await fetch(signedGet, { headers: { Range: 'bytes=99-' } });
  assert.equal(invalid.status, 416, 'MINIO_INVALID_RANGE_EXPECTED_416');
  const head = await fetch(signedHead, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), '16');
  const tampered = new URL(signedGet);
  tampered.searchParams.set('response-cache-control', 'public');
  assert.equal((await fetch(tampered)).status, 403, 'TAMPERED_SIGNATURE_MUST_FAIL');
  const shortLived = await getSignedUrl(client, new GetObjectCommand({
    Bucket: bucket, Key: key,
  }), { expiresIn: 1 });
  await delay(2300);
  assert.equal((await fetch(shortLived)).status, 403, 'EXPIRED_MINIO_CAPABILITY_MUST_FAIL');
  console.log('PASS REAL MINIO anonymous 403 / signed HEAD 200 / Range 206,416 / tamper 403 / expiry 403');
  // One combined nonproduction trace: the shared Web/Mobile CDN policy
  // classifies an actual synthetic edge outage, then a genuine immutable S3
  // GET against this live private MinIO returns authenticated ranged bytes.
  // CDN HEAD itself remains a strictly injected synthetic upstream: this
  // does NOT claim connectivity to Beget or Cloud.ru.
  const mediaDelivery = await import(pathToFileURL(resolve(root,
    'packages/core-client/dist/media-delivery/index.js')).href);
  const feedCdn = `https://quepraquiecebquomiel.begetcdn.cloud/media/v2/qa1/v1/video/360.mp4?md5=ABCDEFGHIJKLMNOPQRSTUV&expires=${Math.floor(Date.now() / 1000) + 180}`;
  const simulatedHead = status => async (_url, opts) => {
    assert.equal(opts?.method, 'HEAD');
    return new Response(null, { status });
  };
  assert.equal(mediaDelivery.isSignedCdnFailoverActive(feedCdn), false);
  for (const status of [403, 404]) {
    assert.equal(await mediaDelivery.probeCdnOutage(feedCdn,
      { fetcher: simulatedHead(status) }), false, 'DENIED_MEDIA_IS_NOT_CDN_OUTAGE');
    assert.equal(mediaDelivery.isSignedCdnFailoverActive(feedCdn), false,
      '403_404_MUST_NOT_OPEN_SHARED_FAILOVER');
  }
  assert.equal(await mediaDelivery.probeCdnOutage(feedCdn,
    { fetcher: simulatedHead(410) }), true, '410_ALLOWS_PER_MEDIA_FALLBACK');
  assert.equal(mediaDelivery.isSignedCdnFailoverActive(feedCdn), false,
    '410_MUST_NOT_POISON_SHARED_CIRCUIT');
  assert.equal(await mediaDelivery.probeCdnOutage(feedCdn,
    { fetcher: simulatedHead(503) }), true, 'CDN_503_ENABLES_FALLBACK');
  assert.equal(mediaDelivery.isSignedCdnFailoverActive(feedCdn), true);
  const privateFallback = await fetch(signedGet, { headers: { Range: 'bytes=8-11' } });
  assert.equal(privateFallback.status, 206, 'REAL_PRIVATE_S3_RANGE_NOT_RESTORED');
  assert.equal(privateFallback.headers.get('cache-control'), 'private, no-store');
  assert.equal(await privateFallback.text(), '89ab');
  assert.equal((await fetch(`${endpoint}/${bucket}/${key}`)).status, 403,
    'MEDIA_CDN_OUTAGE_MUST_NOT_MAKE_S3_PUBLIC');
  const invalidCdn = feedCdn.replace('md5=ABCDEFGHIJKLMNOPQRSTUV', 'md5=bad');
  assert.equal(mediaDelivery.isSignedCdnFailoverActive(invalidCdn), false,
    'UNSIGNED_CDN_URL_MUST_NOT_REUSE_GRANT');
  assert.equal(mediaDelivery.isSignedCdnFailoverActive(feedCdn,
    Date.now() + mediaDelivery.MEDIA_CDN_OUTAGE_COOLDOWN_MS + 1000), false,
    'CIRCUIT_MUST_AUTO_RETRY_CDN_AFTER_COOLDOWN');
  console.log('PASS REAL MinIO 206+403 across simulated CDN 410/503 policy and 403/404 fail-closed cooldown');

  // A real server outage, then persisted private object recovery with original
  // signed capability. This is not an injected HTTP 503 from MinIO.
  await stop();
  await assert.rejects(() => fetch(signedGet, { signal: AbortSignal.timeout(1200) }));
  await start(dataPort, consolePort);
  const recovered = await fetch(signedGet, { headers: { Range: 'bytes=0-3' } });
  assert.equal(recovered.status, 206);
  assert.equal(await recovered.text(), '0123');
  console.log('PASS REAL MINIO process outage -> recovery, existing object and valid SigV4 survive restart');
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  assert.equal((await fetch(signedGet)).status, 404, 'DELETED_MINIO_OBJECT_EXPECTED_404');
  console.log('PASS REAL MINIO signed GET after object deletion -> 404; 410 is CDN/application policy, not MinIO');
} finally {
  client?.destroy();
  try { await stop(); } finally {
    closeSync(logFd);
    // Remove ONLY this run's mkdtemp directory; leave compiled binary and
    // other agent scratch trees untouched.
    rmSync(runDir, { recursive: true, force: true });
  }
}
