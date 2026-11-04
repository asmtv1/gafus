/** One-shot disposable full GAFUS Gallery Core/PG/Sharp/MinIO worker test.
 * Only test-owned ephemeral database/container, random localhost ports and
 * temporary object data. Do not run against fixed WORK or production fixtures.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, mkdirSync, openSync, closeSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pipeline = process.argv[2] ?? 'gallery';
assert(['gallery', 'questions', 'chat2', 'feed'].includes(pipeline), 'ONLY_ISOLATED_GALLERY_QUESTIONS_OR_CHAT2');
const qa = join(root, '.gafus-refactoring', 'architecture-qa-20261103-local');
const binary = join(qa, 'minio-source', 'bin', 'minio');
assert(existsSync(binary), 'OFFICIAL_PINNED_MINIO_BINARY_REQUIRED');
const imageLines = spawnSync('docker', ['image', 'ls', '--format', '{{.ID}} {{.Repository}}:{{.Tag}}'], { encoding: 'utf8' });
assert.equal(imageLines.status, 0, 'DOCKER_IMAGE_LIST_FAILED');
const image = imageLines.stdout.split('\n').find(line => line.endsWith(' postgres:18-alpine'))?.split(' ')[0];
assert(image, 'CACHED_POSTGRES_REQUIRED_NO_PULL');
const disk = spawnSync('df', ['-k', root], { encoding: 'utf8' });
assert.equal(disk.status, 0);
assert(Number(disk.stdout.trim().split('\n').at(-1).trim().split(/\s+/)[3]) > 8_800_000,
  'NOT_ENOUGH_DISK_WITH_EIGHT_GIB_RESERVED');
const db = `archqa_schema_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const name = `gafus-archqa-gallery-${randomUUID().slice(0, 12)}`;
const pwd = `qa_${randomUUID().replaceAll('-', '')}`;
const key = `qa${randomBytes(9).toString('hex')}`;
const secret = randomBytes(32).toString('hex');
const bucket = `gafus-archqa-gallery-${randomBytes(6).toString('hex')}`;
mkdirSync(qa, { recursive: true });
const runDir = mkdtempSync(join(qa, 'gallery-worker-'));
const logFd = openSync(join(runDir, 'minio.log'), 'a');
let containerStarted = false;
let minio;
const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: runDir,
  NODE_ENV: 'test', PRISMA_HIDE_UPDATE_MESSAGE: 'true', GAFUS_LOCAL_ISOLATED_API: '1' };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const docker = (args, timeout = 25000) => {
  const p = spawnSync('docker', args, { encoding: 'utf8', timeout, maxBuffer: 3 * 1024 * 1024 });
  if (p.status !== 0) throw new Error(`LOCAL_DOCKER_FAILURE ${args.slice(0, 3).join(' ')}: ${String(p.stderr).slice(0, 280)}`);
  return p.stdout.trim();
};
async function randomPort() {
  const sock = createServer();
  await new Promise((resolve, reject) => { sock.once('error', reject); sock.listen(0, '127.0.0.1', resolve); });
  const addr = sock.address();
  assert(addr && typeof addr !== 'string');
  await new Promise(resolve => sock.close(resolve));
  return addr.port;
}
async function stopMinio() {
  if (!minio) return;
  const p = minio;
  minio = null;
  if (p.exitCode !== null) return;
  const done = new Promise(resolve => p.once('exit', resolve));
  p.kill('SIGTERM');
  await Promise.race([done, wait(2000)]);
  if (p.exitCode === null) { p.kill('SIGKILL'); await Promise.race([done, wait(1500)]); }
  if (p.exitCode === null) throw new Error('OWN_MINIO_DID_NOT_STOP');
}
try {
  docker(['run', '-d', '--pull', 'never', '--name', name,
    '--publish', '127.0.0.1::5432', '--memory', '768m', '--cpus', '2',
    '--tmpfs', '/var/lib/postgresql:rw,exec,size=768m', '--tmpfs', '/tmp:rw,exec,size=64m',
    '-e', `POSTGRES_PASSWORD=${pwd}`, '-e', `POSTGRES_DB=${db}`, image]);
  containerStarted = true;
  const portMatch = /^127\.0\.0\.1:(\d+)$/.exec(docker(['port', name, '5432/tcp']));
  assert(portMatch, 'EPHEMERAL_PG_LOCALHOST_ONLY');
  let ready = false;
  for (let i = 0; i < 40; i++) {
    const p = spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'postgres'], { stdio: 'ignore', timeout: 2500 });
    if (p.status === 0) { ready = true; break; }
    await wait(400);
  }
  assert(ready, 'DISPOSABLE_PG_NOT_READY');
  const databaseUrl = `postgresql://postgres:${pwd}@127.0.0.1:${portMatch[1]}/${db}?schema=public`;
  const cli = join(root, 'packages', 'prisma', 'node_modules', '.bin', 'prisma');
  const schema = join(root, 'packages', 'prisma', 'schema.prisma');
  const pushed = spawnSync(cli, ['db', 'push', '--skip-generate', '--schema', schema], {
    cwd: root, encoding: 'utf8', timeout: 90_000, maxBuffer: 2 * 1024 * 1024,
    env: { ...env, DATABASE_URL: databaseUrl },
  });
  if (pushed.status !== 0) throw Error(`DISPOSABLE_PG_SCHEMA_PUSH_FAILED ${String(pushed.stderr).slice(-700)}`);
  // This test is intentionally against CURRENT schema, not broken old SQL migrations.
  const s3Port = await randomPort();
  const consolePort = await randomPort();
  assert(s3Port !== consolePort);
  const objects = join(runDir, 'objects');
  mkdirSync(objects);
  minio = spawn(binary, ['server', objects, '--address', `127.0.0.1:${s3Port}`,
    '--console-address', `127.0.0.1:${consolePort}`], {
    cwd: runDir, env: { PATH: env.PATH, HOME: runDir, TMPDIR: runDir,
      MINIO_ROOT_USER: key, MINIO_ROOT_PASSWORD: secret,
      MINIO_BROWSER: 'off', MINIO_UPDATE: 'off', GOMAXPROCS: '2', GOMEMLIMIT: '512MiB' },
    stdio: ['ignore', logFd, logFd],
  });
  let minioReady = false;
  for (let i = 0; i < 80; i++) {
    if (minio.exitCode !== null) break;
    try { const ping = await fetch(`http://127.0.0.1:${s3Port}/minio/health/live`,
      { signal: AbortSignal.timeout(700) }); if (ping.status === 200) { minioReady = true; break; } }
    catch { /* starting */ }
    await wait(250);
  }
  assert(minioReady, 'DISPOSABLE_MINIO_NOT_READY');
  const endpoint = `http://127.0.0.1:${s3Port}`;
  const req = createRequire(join(root, 'packages/gallery-storage/package.json'));
  const { S3Client, CreateBucketCommand } = req('@aws-sdk/client-s3');
  const client = new S3Client({ endpoint, forcePathStyle: true, region: 'us-east-1',
    credentials: { accessKeyId: key, secretAccessKey: secret }, maxAttempts: 1 });
  try { await client.send(new CreateBucketCommand({ Bucket: bucket }));
    if (pipeline === 'chat2') await client.send(new CreateBucketCommand({ Bucket: 'gafus-chat2-media-2026' })); }
  finally { client.destroy(); }
  const cwd = join(root, 'apps/gallery-cloud');
  const config = pipeline === 'gallery' ? 'vitest.archqa-gallery.config.ts'
    : pipeline === 'questions' ? 'vitest.archqa-questions.config.ts'
    : pipeline === 'chat2' ? 'vitest.archqa-chat2.config.ts' : 'vitest.archqa-feed.config.ts';
  const test = spawnSync(join(cwd, 'node_modules/.bin/vitest'), ['run', '--config', config], {
    cwd, encoding: 'utf8', timeout: 90_000, maxBuffer: 4 * 1024 * 1024,
    env: { ...env, DATABASE_URL: databaseUrl, GAFUS_ARCHQA_DB_NAME: db,
      GAFUS_ARCHQA_GALLERY_REALPG: '1', GAFUS_ARCHQA_QUESTIONS_REALPG: pipeline === 'questions' ? '1' : '0',
      GAFUS_ARCHQA_CHAT2_REALPG: pipeline === 'chat2' ? '1' : '0',
      GAFUS_ARCHQA_FEED_REALPG: pipeline === 'feed' ? '1' : '0', GAFUS_ARCHQA_WORK_ROOT: runDir,
      GAFUS_ARCHQA_GALLERY_ENDPOINT: endpoint,
      GAFUS_ARCHQA_GALLERY_BUCKET: bucket, GAFUS_ARCHQA_GALLERY_KEY: key,
      GAFUS_ARCHQA_GALLERY_SECRET: secret },
  });
  const output = `${test.stdout ?? ''}\n${test.stderr ?? ''}`.replaceAll(pwd, '<disposable-secret>').replaceAll(secret, '<disposable-secret>');
  console.log(output.slice(-4300));
  if (test.status !== 0) throw new Error('REAL_GALLERY_WORKER_GAFUS_CORE_PG_MINIO_TEST_FAILED');
  console.log(`PASS REAL_${pipeline.toUpperCase()}_WORKER_E2E: actual Core PG + S3 + Sharp + durable completion`);
} finally {
  try { await stopMinio(); }
  finally {
    closeSync(logFd);
    rmSync(runDir, { recursive: true, force: true });
    if (containerStarted) docker(['rm', '-f', name]);
    console.log('PASS only this run own MinIO and PostgreSQL resources cleaned');
  }
}
