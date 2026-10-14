#!/usr/bin/env node
/**
 * Execute the four real-PostgreSQL media/cleanup integration suites without
 * connecting to either local development database or to production.
 *
 * An isolated PG14 cluster is created under this repository's ignored
 * node_modules/.cache; listens only on 127.0.0.1:55439; all four strict suite
 * database names are newly created, populated from a fresh Prisma datamodel,
 * and disposed on success OR failure. No Docker daemon is required.
 *
 * Run from repository root: node packages/prisma/scripts/run-media-integration-tests.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, lstatSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';

const projectRoot = '/Users/asmtv1/Desktop/gafus1';
const projectCache = join(projectRoot, 'node_modules', '.cache');
const port = 55439;
const dbNames = {
  gallery: 'gafus_gallery_test_20261007',
  feed: 'feed_test',
  polls: 'gafus_poll_ci_media_20261014',
  account: 'gafus_account_cleanup_media_20261014',
};
const schema = join(projectRoot, 'packages/prisma/schema.prisma');
const extras = join(projectRoot, 'packages/prisma/scripts/fresh-db-extras.sql');
const admin = 'integration_admin';
const user = 'cleanup_test';
const connection = name => `postgresql://${user}@127.0.0.1:${port}/${name}`;
const baseEnv = { ...process.env, PGHOST: '127.0.0.1', PGPORT: String(port),
  PGUSER: user, PGCONNECT_TIMEOUT: '5' };

function command(program, args, env = baseEnv, timeout = 120000) {
  const result = spawnSync(program, args, {
    cwd: projectRoot, env, encoding: 'utf8', timeout, maxBuffer: 15 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const message = [result.stdout, result.stderr].filter(Boolean).join('\n').slice(-6500);
    throw new Error(`${program.split('/').pop()} FAILED: ${result.error?.message ?? result.status}\n${message}`);
  }
  return [result.stdout, result.stderr].filter(Boolean).join('\n');
}
function assertRoot() {
  if (process.cwd() !== projectRoot || resolve(process.cwd()) !== projectRoot)
    throw new Error('RUN_ONLY_FROM_GAFUS1_ROOT');
  if (command('git', ['-C', projectRoot, 'rev-parse', '--show-toplevel']).trim() !== projectRoot ||
      command('git', ['-C', projectRoot, 'branch', '--show-current']).trim() !== 'main')
    throw new Error('GAFUS1_MAIN_REQUIRED');
  for (const path of [projectRoot, join(projectRoot, 'node_modules'), projectCache]) {
    if (existsSync(path) && lstatSync(path).isSymbolicLink())
      throw new Error('PROJECT_CACHE_SYMLINK_REFUSED');
  }
  if (!existsSync(schema) || !existsSync(extras)) throw new Error('PRISMA_SCHEMA_MISSING');
}
function portFree() {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', error => { socket.destroy(); resolve(error.code === 'ECONNREFUSED'); });
    socket.setTimeout(1500, () => { socket.destroy(); resolve(false); });
  });
}
function printResult(label, result) {
  const text = result.trim();
  if (text) console.log(label, text.split('\n').slice(-13).join('\n'));
}

assertRoot();
if (!(await portFree())) throw new Error('POSTGRES_PORT_55439_ALREADY_OCCUPIED_REFUSING_TO_TOUCH');
mkdirSync(projectCache, { recursive: true });
const dir = mkdtempSync(join(projectCache, 'gafus-media-integration-postgres-'));
const marker = join(dir, '.gafus-owned-isolated-media-test');
writeFileSync(marker, 'Only the dedicated isolated Postgres test instance. Safe for controlled removal after pg_ctl stop.\n', { flag: 'wx', mode: 0o600 });
const dataDir = join(dir, 'data');
const pgLog = join(dir, 'postgres.log');
let started = false;
let hasError = false;
try {
  console.log('ISOLATED_LOCAL_POSTGRES: port=55439 database_names=' + Object.values(dbNames).join(',') + ' external_databases=UNTOUCHED');
  command('initdb', ['-D', dataDir, '-U', admin, '--auth-local=trust', '--auth-host=trust', '--no-instructions']);
  command('pg_ctl', ['-D', dataDir, '-l', pgLog, '-o',
    `-p ${port} -h 127.0.0.1 -c unix_socket_directories=`, '-w', 'start'], baseEnv, 25000);
  started = true;
  const adminEnv = { ...baseEnv, PGUSER: admin };
  command('psql', ['-w', '-X', '-v', 'ON_ERROR_STOP=1', '-d', 'postgres',
    '-c', `CREATE ROLE ${user} LOGIN CREATEDB`], adminEnv);
  command('createdb', ['-w', '-O', user, dbNames.gallery], adminEnv);
  console.log('TEST_SCHEMA: applying Prisma datamodel to empty isolated DB');
  command('python3', ['packages/prisma/scripts/generate-fresh-db-extras.py', '--check']);
  const prismaEnv = { ...baseEnv, DATABASE_URL: connection(dbNames.gallery) };
  printResult('PRISMA_DB_PUSH:', command('pnpm', ['--filter', '@gafus/prisma', 'exec', 'prisma', 'db', 'push', '--skip-generate', '--schema', schema], prismaEnv, 180000));
  command('psql', ['-w', '-X', '-v', 'ON_ERROR_STOP=1', '-1', '-d', dbNames.gallery, '-f', extras]);
  console.log('PRISMA_MIGRATION_SQL_EXTRAS: applied with rollback on SQL errors');
  for (const db of [dbNames.feed, dbNames.polls, dbNames.account]) {
    command('createdb', ['-w', '-O', user, '-T', dbNames.gallery, db], adminEnv);
  }
  const itEnv = {
    ...baseEnv,
    DATABASE_URL: connection(dbNames.gallery),
    GALLERY_TEST_DATABASE_URL: connection(dbNames.gallery),
    FEED_TEST_DATABASE_URL: connection(dbNames.feed),
    FEED_POLL_TEST_DATABASE_URL: connection(dbNames.polls),
    ACCOUNT_CLEANUP_TEST_DATABASE_URL: connection(dbNames.account),
  };
  // Guard that these are distinct databases and don't share data with dev.
  if (new Set(Object.values(dbNames)).size !== 4 || Object.values(dbNames).some(name =>
      ['dog_trainer', 'dog_trainer_design_20261012', 'gafus'].includes(name)))
    throw new Error('DISPOSABLE_DATABASE_NAME_GUARD_FAILED');
  console.log('RUNNING_REAL_DB_SUITES: gallery, feed, feed polls, account cleanup');
  printResult('INTEGRATION_TEST_RESULTS:', command('pnpm', ['exec', 'vitest', 'run',
    'packages/core/src/services/gallery/gallery.integration.test.ts',
    'packages/core/src/services/feed/feed.integration.test.ts',
    'packages/core/src/services/feed/polls.integration.test.ts',
    'packages/core/src/services/accountCleanup/accountCleanup.integration.test.ts',
    '--reporter=dot'], itEnv, 240000));
  console.log('INTEGRATION_TESTS_PASS');
} catch (error) {
  hasError = true;
  console.error('INTEGRATION_TESTS_FAILED:', error instanceof Error ? error.message : String(error));
  const log = existsSync(pgLog) ? readFileSync(pgLog, 'utf8') : '';
  if (log) console.error('POSTGRES_LAST_LOG_LINES:', log.split('\n').slice(-12).join('\n'));
} finally {
  if (started) {
    try {
      command('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', 'stop'], baseEnv, 25000);
      console.log('ISOLATED_POSTGRES_STOPPED');
    } catch (error) {
      hasError = true;
      console.error('POSTGRES_STOP_FAILED: test-only files retained for safe manual shutdown', error.message);
    }
  }
  if (existsSync(marker) && !hasError || (existsSync(marker) && started && !existsSync(join(dataDir, 'postmaster.pid')))) {
    if (dir.startsWith(projectCache + sep) &&
        dir.slice(projectCache.length + 1).startsWith('gafus-media-integration-postgres-') &&
        lstatSync(dir).isDirectory() && !lstatSync(dir).isSymbolicLink()) {
      rmSync(dir, { recursive: true, force: false });
      console.log('ONLY_ISOLATED_TEST_DB_FILES_REMOVED');
    }
  }
}
if (hasError) process.exitCode = 1;
