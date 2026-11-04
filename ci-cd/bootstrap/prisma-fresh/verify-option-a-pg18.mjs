/** Real GAFUS option A acceptance on a UNIQUE OWNED disposable local PG18. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const scratchRoot = join(root, '.gafus-refactoring/architecture-qa-20261103-local/bootstrap');
const bin = '/opt/homebrew/opt/postgresql@18/bin';
const executable = name => join(bin, name);
const installer = join(here, 'apply-new-empty-db.mjs');
const schema = join(root, 'packages/prisma/schema.prisma');
const prisma = join(root, 'packages/prisma/node_modules/.bin/prisma');
const required = ['initdb', 'postgres', 'pg_ctl', 'psql', 'createdb'];
for (const name of required) assert(existsSync(executable(name)), `OWN_PG18_BINARY_REQUIRED:${name}`);
const disk = spawnSync('df', ['-k', root], { encoding: 'utf8', timeout: 4000 });
assert.equal(disk.status, 0);
const freeKiB = Number(disk.stdout.trim().split('\n').at(-1).trim().split(/\s+/)[3]);
const minimumKiB = 12 * 1024 * 1024;
console.log(`OPTION_A_QA_PROBE freeKiB=${freeKiB} minimumKiB=${minimumKiB}`);
if (process.argv[2] !== '--run') {
  assert.equal(process.argv.length, 2, 'ONLY_EXPLICIT_RUN_ALLOWED');
  console.log('DRY_RUN_ONLY: no PostgreSQL cluster created; use --run with owned local scratch');
  process.exit(freeKiB >= minimumKiB ? 0 : 2);
}
assert.equal(process.argv.length, 3);
assert(freeKiB >= minimumKiB, 'KEEP_8GIB_RESERVE_AND_4GIB_SCRATCH_MARGIN');
mkdirSync(scratchRoot, { recursive: true });
const working = mkdtempSync(join(scratchRoot, 'fresh-option-a-own-'));
const data = join(working, 'data');
const owner = `qa_${randomUUID().replaceAll('-', '')}`;
const database = `archqa_fresh_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const badDatabase = `archqa_fresh_dirty_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const env = {
  PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`,
  HOME: working, LC_ALL: 'C', LANG: 'C', NODE_ENV: 'test',
  PRISMA_HIDE_UPDATE_MESSAGE: 'true', PGCONNECT_TIMEOUT: '4',
};
const run = (program, args, { timeout = 35_000, allowFailure = false, extraEnv = {} } = {}) => {
  const result = spawnSync(program, args, { cwd: root,
    env: { ...env, ...extraEnv }, encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024 });
  if (!allowFailure && result.status !== 0)
    throw Error(`OWNED_OPTION_A_COMMAND_FAILED:${program.split('/').at(-1)}:${result.status}\n${String(result.stderr).slice(-800)}\n${String(result.stdout).slice(-750)}`);
  return result;
};
async function unusedLoopbackPort() {
  const server = createServer();
  await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
  const value = server.address();
  assert(value && typeof value === 'object' && value.port > 0);
  await new Promise(yes => server.close(yes));
  return value.port;
}
let started = false;
try {
  const port = await unusedLoopbackPort();
  run(executable('initdb'), ['-D', data, '--no-instructions', '--encoding=UTF8',
    '--no-locale', '--auth-local=trust', '--auth-host=trust', '--username', owner],
  { timeout: 45_000 });
  appendFileSync(join(data, 'postgresql.conf'),
    `\nlisten_addresses = '127.0.0.1'\nport = ${port}\nunix_socket_directories = ''\nmax_connections = 24\nshared_buffers = '32MB'\n`);
  const log = join(working, 'postgres.log');
  const server = run(executable('pg_ctl'), ['-D', data, '-l', log, '-w', '-t', '15', 'start'],
    { timeout: 30_000, allowFailure: true });
  if (server.status !== 0)
    throw Error(`OWNED_LOCAL_PG18_START_FAILED:${String(server.stderr).slice(-500)} ${existsSync(log) ? readFileSync(log, 'utf8').slice(-700) : ''}`);
  started = true;
  for (const dbName of [database, badDatabase])
    run(executable('createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', owner, dbName]);
  const sql = (name, query) => run(executable('psql'), ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
    '-h', '127.0.0.1', '-p', String(port), '-U', owner, '-d', name, '-c', query]).stdout.trim();
  const connection = name => `postgresql://${owner}@127.0.0.1:${port}/${name}?schema=public`;
  const bootstrap = (name, confirm = name) => run(process.execPath, [installer, '--apply'], {
    timeout: 850_000, allowFailure: true,
    extraEnv: { DATABASE_URL: connection(name), GAFUS_FRESH_BOOTSTRAP_CONFIRM: confirm },
  });
  assert.equal(sql(database, "SELECT count(*) FROM pg_tables WHERE schemaname='public'"), '0');
  // Wrong confirmation always fails before any DB write.
  const noConfirm = bootstrap(database, 'WRONG_NAME');
  assert.notEqual(noConfirm.status, 0, 'INCORRECT_CONFIRMATION_MUST_FAIL');
  assert.equal(sql(database, "SELECT count(*) FROM pg_tables WHERE schemaname='public'"), '0');
  // Guard against non-table objects too; ORM model-only guards miss this case.
  sql(badDatabase, 'CREATE TYPE "ExistingEnum" AS ENUM (\'A\')');
  const dirty = bootstrap(badDatabase);
  assert.notEqual(dirty.status, 0, 'NONEMPTY_ENUM_DATABASE_MUST_REFUSE');
  assert.match(`${dirty.stderr}${dirty.stdout}`, /FRESH_ONLY_DATABASE_NOT_EMPTY/);
  assert.equal(sql(badDatabase,
    "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='_prisma_migrations'"), '0');
  console.log('PASS wrong-confirmation and nonempty-type both fail before any DDL/ledger');

  const fresh = bootstrap(database);
  if (fresh.status !== 0) throw Error(`ACTUAL_BASELINE_RUN_FAILED:${fresh.status}\n${String(fresh.stderr).slice(-1800)}\n${String(fresh.stdout).slice(-1200)}`);
  console.log(String(fresh.stdout).trim());
  assert.equal(sql(database, 'SELECT count(*) FROM "_prisma_migrations"'), '163');
  assert.equal(sql(database, "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal"), '12');
  // An already bootstrapped DB (with valid Prisma ledger) must reject reentry.
  const replay = bootstrap(database);
  assert.notEqual(replay.status, 0, 'BOOTSTRAP_REPLAY_MUST_REFUSE');
  assert.match(`${replay.stderr}${replay.stdout}`, /FRESH_ONLY_DATABASE_NOT_EMPTY/);
  assert.equal(sql(database, 'SELECT count(*) FROM "_prisma_migrations"'), '163');
  console.log('PASS real Prisma migrate resolve 163/163, checked SQL digests, deploy no-op and safe replay refusal');

  // An upcoming additive migration MUST go through real Prisma migrate deploy.
  // Never add the test migration to packages/prisma/migrations or modify source.
  const cloned = join(working, 'synthetic-future');
  mkdirSync(cloned, { recursive: true });
  copyFileSync(schema, join(cloned, 'schema.prisma'));
  cpSync(join(root, 'packages/prisma/migrations'), join(cloned, 'migrations'), { recursive: true });
  const probeName = '20990101000000_archqa_fresh_forward_probe';
  const probeFolder = join(cloned, 'migrations', probeName);
  mkdirSync(probeFolder);
  const probeSql = 'CREATE TABLE "ArchqaFreshForwardProbe" ("id" integer PRIMARY KEY, "note" text NOT NULL);\n';
  writeFileSync(join(probeFolder, 'migration.sql'), probeSql);
  const forwardEnv = { DATABASE_URL: connection(database) };
  const prismaCli = args => run(prisma, args.concat(['--schema', join(cloned, 'schema.prisma')]),
    { timeout: 120_000, extraEnv: forwardEnv });
  prismaCli(['migrate', 'deploy']);
  assert.equal(sql(database, 'SELECT count(*) FROM "_prisma_migrations"'), '164');
  assert.equal(sql(database, "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='ArchqaFreshForwardProbe'"), '1');
  const actualHash = sql(database,
    `SELECT checksum FROM "_prisma_migrations" WHERE migration_name='${probeName}'`);
  assert.equal(actualHash, createHash('sha256').update(probeSql).digest('hex'));
  prismaCli(['migrate', 'status']);
  prismaCli(['migrate', 'deploy']);
  assert.equal(sql(database, 'SELECT count(*) FROM "_prisma_migrations"'), '164');
  console.log('PASS FUTURE_REAL_PRISMA_MIGRATE_DEPLOY migration=164 journalChecksum=SHA256; repeated deploy NOOP');
  console.log('PASS owned disposable local PostgreSQL 18 OPTION A all acceptance checks');
} finally {
  // Delete ONLY our unique local temporary PG directory, and only after stop.
  const running = existsSync(data) && run(executable('pg_ctl'), ['-D', data, 'status'],
    { allowFailure: true, timeout: 4_000 }).status === 0;
  if (running) run(executable('pg_ctl'), ['-D', data, '-m', 'immediate', '-w', '-t', '15', 'stop'],
    { timeout: 25_000 });
  if (existsSync(data)) assert.notEqual(run(executable('pg_ctl'), ['-D', data, 'status'],
    { allowFailure: true, timeout: 4_000 }).status, 0, 'OWN_PG18_MUST_BE_STOPPED');
  rmSync(working, { recursive: true, force: true });
  console.log('PASS cleaned ONLY own isolated fresh Option A scratch cluster');
}
