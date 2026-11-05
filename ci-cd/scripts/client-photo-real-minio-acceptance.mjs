/** Disposable REAL S3 POST -> HEAD/GET -> WebP decode -> ETag-fenced COPY -> HEAD/GET.
 * No Cloud.ru, live buckets, remote containers, user data or existing services.
 * One isolated MinIO process; random loopback ports, credentials, bucket and data.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, openSync, closeSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const path = join(root, '.gafus-refactoring', 'architecture-qa-20261103-local');
const bin = join(path, 'minio-source', 'bin', 'minio');
assert(existsSync(bin), 'LOCAL_PINNED_MINIO_REQUIRED');
const available = spawnSync('df', ['-k', root], { encoding: 'utf8' });
assert.equal(available.status, 0);
assert(Number(available.stdout.trim().split('\n').at(-1).trim().split(/\s+/)[3]) > 7 * 1024 * 1024,
  'KEEP_7_GIB_HEADROOM');
const req = createRequire(join(root, 'packages/cdn-upload/package.json'));
const { S3Client, CreateBucketCommand, HeadObjectCommand, GetObjectCommand, PutObjectCommand } = req('@aws-sdk/client-s3');
const { createPresignedPost } = req('@aws-sdk/s3-presigned-post');
const sharp = req('sharp');
const { signClientWebpStaging, verifyClientWebp, copyVerifiedClientWebp } =
  await import(join(root, 'packages/cdn-upload/dist/clientPhotoRenditions.js'));
const key = 'qa' + randomBytes(8).toString('hex');
const secret = randomBytes(30).toString('hex');
const bucket = `gafus-local-client-photo-${randomUUID().slice(0, 12)}`;
const scratch = mkdtempSync(join(path, 'client-photo-'));
const data = join(scratch, 'objects');
mkdirSync(data);
const log = openSync(join(scratch, 'minio.log'), 'a');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  await new Promise(resolve => server.close(resolve));
  return address.port;
}
let child, client;
try {
  const api = await port(), consolePort = await port();
  assert(api !== consolePort);
  const origin = `http://127.0.0.1:${api}`;
  child = spawn(bin, ['server', data, '--address', `127.0.0.1:${api}`,
    '--console-address', `127.0.0.1:${consolePort}`], {
    cwd: scratch,
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: scratch, TMPDIR: scratch,
      MINIO_ROOT_USER: key, MINIO_ROOT_PASSWORD: secret, MINIO_BROWSER: 'off',
      MINIO_UPDATE: 'off', GOMAXPROCS: '2', GOMEMLIMIT: '512MiB' },
    stdio: ['ignore', log, log],
  });
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) break;
    try {
      const resp = await fetch(`${origin}/minio/health/live`, { signal: AbortSignal.timeout(500) });
      if (resp.status === 200) { ready = true; break; }
    } catch { /* isolated process starting */ }
    await delay(200);
  }
  assert(ready, 'ISOLATED_MINIO_UNAVAILABLE');
  client = new S3Client({ endpoint: origin, region: 'us-east-1', forcePathStyle: true,
    maxAttempts: 1, credentials: { accessKeyId: key, secretAccessKey: secret },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  const mediaId = randomUUID();
  const rootKey = `posts/user/${mediaId}/incoming/upload`;
  const smallKey = `${rootKey}/s.webp`;
  const mediumKey = `${rootKey}/m.webp`;
  const fullKey = `${rootKey}/source.webp`;
  const finals = ['s', 'm', 'l'].map(v => `media/v2/${mediaId}/v1/image/${v}.webp`);
  const uploads = await Promise.all([360, 720, 1440].map(async edge => {
    const bytes = await sharp({ create: { width: edge, height: Math.round(edge * .75),
      channels: 3, background: '#8B9846' } }).webp({ quality: 80 }).toBuffer();
    return { bytes, edge };
  }));
  const keys = [smallKey, mediumKey, fullKey];
  const signed = await Promise.all(keys.map((objectKey, index) => index === 2
    ? createPresignedPost(client, { Bucket: bucket, Key: objectKey, Expires: 300,
        Fields: { 'Content-Type': 'image/webp', success_action_status: '204' },
        Conditions: [['content-length-range', uploads[index].bytes.length,
          uploads[index].bytes.length + 24 * 1024], ['eq', '$Content-Type', 'image/webp'],
          ['eq', '$key', objectKey], ['eq', '$success_action_status', '204']] })
    : signClientWebpStaging(client, bucket, objectKey, 1_750_000, 300)));
  for (let i = 0; i < keys.length; i++) {
    const form = new FormData();
    for (const [field, value] of Object.entries(signed[i].fields)) form.append(field, value);
    form.append('file', new Blob([uploads[i].bytes], { type: 'image/webp' }), 'photo.webp');
    const response = await fetch(signed[i].url, { method: 'POST', body: form,
      signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 204, `S3_POST_${i}_${response.status}_${(await response.text()).slice(0, 350)}`);
  }
  const verified = await Promise.all(keys.map((objectKey, i) =>
    verifyClientWebp(client, bucket, objectKey, uploads[i].edge, 1_750_000)));
  assert.deepEqual(verified.map(item => item.width), [360, 720, 1440]);
  await Promise.all(keys.map((objectKey, i) =>
    copyVerifiedClientWebp(client, bucket, objectKey, finals[i], verified[i])));
  for (let i = 0; i < finals.length; i++) {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: finals[i] }));
    assert.equal(head.ContentType, 'image/webp');
    assert.equal(head.ContentLength, verified[i].bytes);
    const returned = await client.send(new GetObjectCommand({ Bucket: bucket, Key: finals[i] }));
    assert.deepEqual(Buffer.from(await returned.Body.transformToByteArray()), uploads[i].bytes);
  }
  const unsigned = await fetch(`${origin}/${bucket}/${finals[0]}`, { signal: AbortSignal.timeout(6000) });
  assert.equal(unsigned.status, 403, 'STAGING_AND_FINAL_BUCKET_MUST_BE_PRIVATE');
  const wrongMime = `${rootKey}/bad.webp`;
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: wrongMime, Body: uploads[0].bytes,
    ContentType: 'image/jpeg' }));
  await assert.rejects(() => verifyClientWebp(client, bucket, wrongMime, 360), /CLIENT_PHOTO_UNVERIFIED_HEAD/);
  const corrupt = `${rootKey}/corrupt.webp`;
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: corrupt,
    Body: Buffer.alloc(100, 0), ContentType: 'image/webp' }));
  await assert.rejects(() => verifyClientWebp(client, bucket, corrupt, 360));
  console.log('PASS REAL MINIO: signed multipart WebP POST×3, ETag-checked HEAD/GET, immutable-key COPY×3, exact byte delivery, anonymous 403, invalid MIME/corrupt rejection');
} finally {
  client?.destroy();
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await Promise.race([exited, delay(2500)]);
    if (child.exitCode === null) { child.kill('SIGKILL'); await Promise.race([exited, delay(1000)]); }
  }
  closeSync(log);
  rmSync(scratch, { recursive: true, force: true });
}
