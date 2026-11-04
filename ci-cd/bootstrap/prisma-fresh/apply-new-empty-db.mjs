/**
 * GAFUS option A: review-locked SQL bootstrap + official Prisma baseline journal.
 * Deliberately LOOPBACK-ONLY: a production / remote run needs a separate review.
 * DO NOT use on any existing database, production, staging or copied backup.
 * On failure after DDL, discard the NEW OWNED database; NEVER resume blindly.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const schema = join(root, 'packages/prisma/schema.prisma');
const prisma = join(root, 'packages/prisma/node_modules/.bin/prisma');
const reviewGate = join(here, 'review-gate.mjs');
const inventory = JSON.parse(readFileSync(join(here, 'inventory.review.json'), 'utf8'));
const mode = process.argv[2];
if (!['--check', '--apply'].includes(mode) || process.argv.length !== 3)
  throw Error('USAGE: node apply-new-empty-db.mjs --check|--apply');

function run(program, args, { env = {}, timeout = 35_000, allowFailure = false } = {}) {
  const proc = spawnSync(program, args, {
    cwd: root, encoding: 'utf8', timeout, maxBuffer: 3 * 1024 * 1024,
    env: { ...process.env, ...env, PRISMA_HIDE_UPDATE_MESSAGE: 'true' },
  });
  // Never print argv/URL: database credentials may be embedded in env/arguments.
  if (!allowFailure && proc.status !== 0)
    throw Error(`FRESH_BASELINE_COMMAND_FAILED:${program.split('/').at(-1)}:${proc.status}:` +
      `${String(proc.stderr).replaceAll(process.env.DATABASE_URL ?? '\0', '[DATABASE_URL]').slice(-750)}`);
  return proc;
}
run(process.execPath, [reviewGate], { timeout: 35_000 });
const allMigrationNames = readdirSync(join(root, 'packages/prisma/migrations'), { withFileTypes: true })
  .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
const migrationNames = Object.keys(inventory.migrationsSha256).sort();
const lastHistorical = migrationNames.at(-1);
assert.deepEqual(allMigrationNames.filter(name => name <= lastHistorical), migrationNames,
  'REVIEWED_163_HISTORICAL_MIGRATIONS_UNCHANGED');
const forwardNames = allMigrationNames.filter(name => name > lastHistorical);
console.log(`FRESH_OPTION_A_REVIEW_LOCK_PASS historical_migrations=${migrationNames.length} forward_migrations=${forwardNames.length}`);
if (mode === '--check') {
  console.log('READ_ONLY_PASS: no database connected, no history registered');
  process.exit(0);
}

// Strict double opt-in AND local-only connection. A remote/cloud DB is never
// reachable through this entrypoint even if the user knows the confirmation.
const raw = process.env.DATABASE_URL;
if (!raw) throw Error('DATABASE_URL_REQUIRED');
let url;
try { url = new URL(raw); } catch { throw Error('DATABASE_URL_INVALID'); }
const database = decodeURIComponent(url.pathname.slice(1));
assert(['postgresql:', 'postgres:'].includes(url.protocol), 'POSTGRES_ONLY');
assert(['127.0.0.1', 'localhost'].includes(url.hostname), 'REMOTE_DATABASE_FORBIDDEN');
assert(/^\d{2,5}$/.test(url.port) && Number(url.port) > 0 && Number(url.port) <= 65535,
  'EXPLICIT_LOCAL_PORT_REQUIRED');
assert(/^(?:gafus|archqa)_fresh(?:_[a-z0-9_]+)?$/.test(database), 'FRESH_DATABASE_NAME_REQUIRED');
assert(process.env.GAFUS_FRESH_BOOTSTRAP_CONFIRM === database, 'CONFIRM_EXACT_NEW_DATABASE_NAME');
assert(url.username && !url.hash, 'DATABASE_OWNER_REQUIRED');
assert([...url.searchParams.keys()].every(key => key === 'schema') &&
  (!url.searchParams.has('schema') || url.searchParams.get('schema') === 'public'),
  'ONLY_DEFAULT_PUBLIC_SCHEMA_ALLOWED');
const databaseEnv = { PGPASSWORD: decodeURIComponent(url.password),
  PGCONNECT_TIMEOUT: '4', PGAPPNAME: 'gafus_fresh_option_a_only' };
const psqlArgs = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
  '-h', url.hostname, '-p', url.port, '-U', decodeURIComponent(url.username), '-d', database];
const psql = query => run('psql', [...psqlArgs, '-c', query], { env: databaseEnv }).stdout.trim();
const execute = (sqlFiles, allowFailure = false) => run('psql',
  [...psqlArgs, '--single-transaction', ...sqlFiles.flatMap(file => ['-f', file])],
  { env: databaseEnv, timeout: 120_000, allowFailure });
const prismaCommand = (command, args, options = {}) => run(prisma,
  ['migrate', command, ...args, '--schema', schema], { timeout: 90_000, ...options });

// Before any write confirm local owner and completely empty public schema.
const dbState = psql(`SELECT current_database() || '|' || current_user || '|' ||
  COALESCE(host(inet_server_addr()),'') || '|' || pg_is_in_recovery() || '|' ||
  current_setting('server_version_num')`);
const [actualDb, owner, address, recovery, version] = dbState.split('|');
assert(actualDb === database && owner === decodeURIComponent(url.username),
  'WRONG_DATABASE_OR_OWNER');
assert(['127.0.0.1', '::1'].includes(address) && ['f', 'false'].includes(recovery),
  `LOOPBACK_WRITABLE_POSTGRES_REQUIRED:address=${address} recovery=${recovery}`);
assert(Number(version) >= 160000 && Number(version) < 190000,
  'TESTED_POSTGRES_16_TO_18_ONLY');
const empty = psql(`SELECT
  (SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname NOT LIKE 'pg_%') +
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') +
  (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') +
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') +
  (SELECT count(*) FROM pg_extension WHERE extname <> 'plpgsql')`);
assert(empty === '0', 'FRESH_ONLY_DATABASE_NOT_EMPTY_BEFORE_DDL');

// The precondition is RECHECKED in the same transaction as every DDL statement.
execute([join(here, 'fresh-only-precondition.sql'),
  join(here, 'fresh-only-bootstrap.candidate.sql')]);
const expected = [
  ["SELECT count(*) FROM pg_tables WHERE schemaname='public'", 186, 'TABLES'],
  ["SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype='c'", 65, 'CHECKS'],
  ["SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal", 12, 'TRIGGERS'],
  ["SELECT count(*) FROM pg_extension WHERE extname='uuid-ossp'", 1, 'EXTENSION'],
  ["SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='_prisma_migrations'", 0, 'NO_JOURNAL_BEFORE_RESOLVE'],
];
for (const [sql, value, label] of expected)
  assert.equal(Number(psql(sql)), value, `FRESH_SQL_PARITY:${label}`);
// uuid-ossp exposes 10 extension-owned functions in public; count exactly the
// nine historical GAFUS functions rather than ALL public pg_proc rows.
const historicalFunctions = [
  'guard_app_subscription_payment_price_snapshot',
  'guard_app_subscription_promo_code_identity',
  'prevent_app_subscription_promo_code_event_mutation',
  'chat2_capture_media_deletion', 'gafus_course_increment_version',
  'gafus_bump_course_content_revision', 'feed_normalize_profile_city',
  'feed_normalize_breed_key', 'feed_normalize_pet_breed',
];
for (const name of historicalFunctions)
  assert.equal(psql(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='${name}'`), '1', `HISTORICAL_FUNCTION_MISSING:${name}`);
console.log('FRESH_OPTION_A_SCHEMA_PASS tables=186 checks=65 triggers=12 functions=9');

// Official Prisma CLI, not hand-written _prisma_migrations inserts. On partial
// interruption never resume; the existing DB guard will refuse the next run.
for (let i = 0; i < migrationNames.length; i++) {
  prismaCommand('resolve', ['--applied', migrationNames[i]], { timeout: 55_000 });
  if ((i + 1) % 25 === 0 || i + 1 === migrationNames.length)
    console.log(`FRESH_OPTION_A_LEDGER_PROGRESS ${i + 1}/${migrationNames.length}`);
}
const rows = psql('SELECT migration_name || E\'\\t\' || checksum FROM "_prisma_migrations" ORDER BY migration_name');
const actual = rows.split('\n').map(row => row.split('\t'));
assert.equal(actual.length, migrationNames.length, 'BASELINE_JOURNAL_COUNT');
for (const [i, [name, checksum]] of actual.entries()) {
  assert.equal(name, migrationNames[i], `BASELINE_JOURNAL_NAME_${i}`);
  assert.equal(checksum, inventory.migrationsSha256[name], `BASELINE_JOURNAL_CHECKSUM_${name}`);
}
assert.equal(psql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL'),
  '0', 'NO_FAILED_OR_ROLLED_BACK_BASELINE');
// Prisma now applies ONLY migrations appended after the frozen 163 baseline;
// historic checksums remain exactly the same. A second deploy must be NOOP.
prismaCommand('deploy', [], { timeout: 120_000 });
prismaCommand('deploy', [], { timeout: 120_000 });
prismaCommand('status', [], { timeout: 55_000 });
const fullLedgerRows = psql('SELECT migration_name || E\'\\t\' || checksum FROM "_prisma_migrations" ORDER BY migration_name');
const fullLedger = fullLedgerRows.split('\n').map(row => row.split('\t'));
assert.equal(fullLedger.length, allMigrationNames.length, 'ALL_FORWARD_MIGRATIONS_APPLIED');
for (const [i, [name, checksum]] of fullLedger.entries()) {
  assert.equal(name, allMigrationNames[i], `FULL_LEDGER_ORDER_${i}`);
  const wanted = name in inventory.migrationsSha256 ? inventory.migrationsSha256[name] :
    createHash('sha256').update(readFileSync(join(root, 'packages/prisma/migrations', name, 'migration.sql'))).digest('hex');
  assert.equal(checksum, wanted, `FULL_LEDGER_CHECKSUM_${name}`);
}
// Exactly two historical raw indexes are intentionally richer than Prisma's
// datamodel. A drift check must NEVER run DROP INDEX to force a zero diff.
const diff = run(prisma, ['migrate', 'diff', '--from-schema-datasource', schema,
  '--to-schema-datamodel', schema, '--script'], { timeout: 90_000 }).stdout;
const diffSql = diff.replace(/^--[^\n]*$/gm, '').trim();
const statements = diffSql.split(';').map(x => x.trim()).filter(Boolean);
const rawIndexes = new Set(['PetDocument_petId_ownerId_idx',
  'AppSubscriptionPayment_subscriptionId_status_succeededAt_idx']);
assert(statements.length === 2 && statements.every(text => {
  const match = /^DROP INDEX "([^"]+)"$/.exec(text);
  return match && rawIndexes.has(match[1]);
}), `UNREVIEWED_PRISMA_SCHEMA_DRIFT:${diffSql.slice(0,300)}`);
console.log('FRESH_OPTION_A_PARITY_PASS preserved_two_historical_raw_indexes');

console.log(`FRESH_OPTION_A_FULL_PASS historical_applied=${migrationNames.length} forward_applied=${forwardNames.length} migrate_status=PASS migrate_deploy_twice=NOOP`);
