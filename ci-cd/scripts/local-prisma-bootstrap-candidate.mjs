/**
 * Isolated clean-database test for a schema-only Prisma baseline candidate.
 * This does NOT mark historical migrations applied or modify any existing DB.
 * Existing migration history includes raw SQL triggers and data updates not
 * represented in schema.prisma; the candidate is intentionally NOT deployable.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const schema = join(root, 'packages/prisma/schema.prisma');
const candidate = join(root, '.gafus-refactoring/architecture-qa-20261103-local/bootstrap/current-prisma-schema-only-baseline.candidate.sql');
const sql = readFileSync(candidate, 'utf8');
assert(sql.includes('CREATE TABLE "ExamResult"'), 'BASELINE_REQUIRES_EXAM_RESULT');
assert(sql.includes('CREATE TABLE "AppSubscriptionEvent"'), 'BASELINE_REQUIRES_SUBSCRIPTION_EVENTS');
const name = `gafus-archqa-baseline-${randomUUID().slice(0, 12)}`;
const database = `archqa_baseline_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const password = `qa_${randomUUID().replaceAll('-', '')}`;
const docker = (args, timeout = 25000) => {
  const proc = spawnSync('docker', args, { encoding: 'utf8', timeout, maxBuffer: 3 * 1024 * 1024 });
  if (proc.status !== 0) throw Error(`ISOLATED_DOCKER_COMMAND_FAILED ${args.slice(0, 3).join(' ')}: ${String(proc.stderr).slice(0, 250)}`);
  return proc.stdout.trim();
};
const image = docker(['image', 'ls', '--format', '{{.ID}} {{.Repository}}:{{.Tag}}'])
  .split('\n').find(line => line.endsWith(' postgres:18-alpine'))?.split(' ')[0];
assert(image, 'CACHED_PG18_ONLY_NO_PULL');
const disk = spawnSync('df', ['-k', root], { encoding: 'utf8' });
assert.equal(disk.status, 0);
assert(Number(disk.stdout.trim().split('\n').at(-1).trim().split(/\s+/)[3]) > 8_600_000,
  'REQUIRE_EIGHT_GIB_FREE_DISK_RESERVE');
const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '/',
  NODE_ENV: 'test', PRISMA_HIDE_UPDATE_MESSAGE: 'true' };
let owned = false;
try {
  docker(['run', '-d', '--pull', 'never', '--name', name,
    '--publish', '127.0.0.1::5432', '--memory', '768m', '--cpus', '1',
    '--tmpfs', '/var/lib/postgresql:rw,exec,size=768m',
    '--tmpfs', '/tmp:rw,exec,size=64m',
    '-e', `POSTGRES_PASSWORD=${password}`, '-e', `POSTGRES_DB=${database}`, image]);
  owned = true;
  const match = /^127\.0\.0\.1:(\d+)$/.exec(docker(['port', name, '5432/tcp']));
  assert(match, 'EPHEMERAL_LOCALHOST_ONLY_PORT');
  for (let i = 0; i < 32; i++) {
    const p = spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'postgres'], {
      stdio: 'ignore', timeout: 2500 });
    if (p.status === 0) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
    if (i === 31) throw Error('FRESH_PG_NOT_READY');
  }
  const url = `postgresql://postgres:${password}@127.0.0.1:${match[1]}/${database}?schema=public`;
  const cli = join(root, 'packages/prisma/node_modules/.bin/prisma');
  const run = args => spawnSync(cli, args, {
    cwd: root, env: { ...env, DATABASE_URL: url }, encoding: 'utf8',
    timeout: 90_000, maxBuffer: 2 * 1024 * 1024,
  });
  const applied = run(['db', 'execute', '--url', url, '--file', candidate]);
  if (applied.status !== 0) {
    const safe = `${applied.stderr}\n${applied.stdout}`.replaceAll(password, '<synthetic-secret>');
    throw Error(`CANDIDATE_BOOTSTRAP_SQL_FAILED ${safe.slice(-1200)}`);
  }
  const verify = run(['migrate', 'diff', '--from-url', url, '--to-schema-datamodel', schema, '--exit-code']);
  if (verify.status !== 0) {
    throw Error(`CANDIDATE_PRISMA_DATAMODEL_DIFF_NOT_EMPTY ${String(verify.stdout).slice(-1200)}`);
  }
  const psql = query => docker(['exec', name, 'psql', '-X', '-q', '-A', '-t',
    '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-c', query]);
  const tables = Number(psql(`SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`));
  const triggers = Number(psql(`SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal`));
  const history = Number(psql(`SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='_prisma_migrations'`));
  assert(tables >= 180, 'BASELINE_FRESH_SCHEMA_TABLE_COUNT_TOO_LOW');
  assert.equal(history, 0, 'NEVER_FAKE_PRISMA_MIGRATION_HISTORY');
  console.log(`PASS schema-only candidate executed on fresh PG18; ${tables} tables; Prisma datamodel diff EMPTY`);
  console.log(`EXPECTED_LIMITATION custom migration triggers in candidate=${triggers}; historical raw SQL migrations require audited preservation`);
  console.log('PASS fresh DB has no _prisma_migrations; no historical row was marked applied');
} finally {
  if (owned) docker(['rm', '-f', name]);
  console.log('PASS only test-owned disposable PostgreSQL container cleaned');
}
