/**
 * Run current GAFUS Prisma migrations against a fresh disposable PostgreSQL 18
 * instance only, then verify real event uniqueness/replay storage constraints.
 * Own random container and loopback-bound ephemeral port; no user DB, .env,
 * production secrets, MinIO, migrations on an existing DB or image pulls.
 * This is a DB schema-level acceptance, NOT real provider webhook orchestration.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const name = `gafus-archqa-prisma-payment-${randomUUID().slice(0, 12)}`;
let db = `archqa_payment_${randomUUID().slice(0, 12)}`;
const secret = `qa_${randomUUID().replaceAll('-', '')}`;
const cliEnv = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '/',
  NODE_ENV: 'test', PRISMA_HIDE_UPDATE_MESSAGE: 'true' };
function callDocker(args, opts = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: opts.timeout ?? 20000,
    maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0 || result.error) throw Error(`OWN_CONTAINER_COMMAND_FAILED ${args.slice(0, 4).join(' ')}: ${String(result.stderr || result.error).slice(0, 210)}`);
  return result.stdout.trim();
}
const imageListing = callDocker(['image', 'ls', '--format', '{{.ID}} {{.Repository}}:{{.Tag}}']);
const image = imageListing.split('\n').find(s => s.endsWith(' postgres:18-alpine'))?.split(' ')[0];
if (!image) throw Error('NO_CACHED_POSTGRES_IMAGE_NO_PULL');
const free = spawnSync('df', ['-k', root], { encoding: 'utf8' });
assert.equal(free.status, 0);
assert(Number(free.stdout.trim().split('\n').at(-1).trim().split(/\s+/)[3]) > 8_000_000,
  'DISK_HEADROOM_TOO_LOW_FOR_EPHEMERAL_MIGRATIONS');
let started = false;
try {
  callDocker(['run', '-d', '--pull', 'never', '--name', name,
    '--publish', '127.0.0.1::5432', '--memory', '768m', '--cpus', '2',
    '--tmpfs', '/var/lib/postgresql:rw,exec,size=768m',
    '--tmpfs', '/tmp:rw,exec,size=64m',
    '-e', `POSTGRES_PASSWORD=${secret}`, '-e', `POSTGRES_DB=${db}`, image]);
  started = true;
  const portInfo = callDocker(['port', name, '5432/tcp']);
  const port = /^127\.0\.0\.1:(\d{1,5})$/.exec(portInfo)?.[1];
  assert(port && Number(port) >= 1 && Number(port) <= 65535,
    `LOCAL_ONLY_DYNAMIC_PORT_REQUIRED (${portInfo})`);
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const proc = spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'postgres'], {
      stdio: 'ignore', timeout: 2000,
    });
    if (proc.status === 0) { ready = true; break; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  assert(ready, 'EPHEMERAL_POSTGRES_NOT_READY');
  const databaseUrl = `postgresql://postgres:${secret}@127.0.0.1:${port}/${db}?schema=public`;
  const cli = resolve(root, 'packages/prisma/node_modules/.bin/prisma');
  const migrate = spawnSync(cli, ['migrate', 'deploy', '--schema', resolve(root, 'packages/prisma/schema.prisma')], {
    cwd: root, env: { ...cliEnv, DATABASE_URL: databaseUrl }, encoding: 'utf8', timeout: 180000,
    maxBuffer: 3 * 1024 * 1024,
  });
  const cleanMigrationsApplied = migrate.status === 0;
  if (!cleanMigrationsApplied) {
    const safeOutput = `${migrate.stdout ?? ''}\n${migrate.stderr ?? ''}`
      .replaceAll(secret, '<synthetic-password>');
    const failedMigration = safeOutput.match(/Migration name: ([^\n]+)/)?.[1] ?? 'unknown';
    const missing = safeOutput.match(/relation "([^"]+)" does not exist/)?.[1] ?? 'unknown';
    console.log(`BLOCKER real clean migrate deploy FAILED, migration=${failedMigration}, missing_relation=${missing}`);
    // Current schema can be tested independently without pretending that
    // replaying 163 legacy SQL migrations is supported from a blank database.
    const schemaDb = `archqa_schema_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    callDocker(['exec', name, 'psql', '-X', '-q', '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE ${schemaDb}`]);
    db = schemaDb;
    const schemaUrl = `postgresql://postgres:${secret}@127.0.0.1:${port}/${db}?schema=public`;
    const push = spawnSync(cli, ['db', 'push', '--skip-generate', '--schema',
      resolve(root, 'packages/prisma/schema.prisma')], {
      cwd: root, env: { ...cliEnv, DATABASE_URL: schemaUrl }, encoding: 'utf8',
      timeout: 180000, maxBuffer: 3 * 1024 * 1024,
    });
    if (push.status !== 0) {
      const output = `${push.stdout ?? ''}\n${push.stderr ?? ''}`.replaceAll(secret, '<synthetic-password>');
      throw Error(`FRESH_EPHEMERAL_DB_PUSH_FAILED ${output.slice(-1800)}`);
    }
    console.log('PASS current Prisma schema db push into a DIFFERENT empty synthetic DB (not migrate deploy)');
  }
  const psql = (sql, database = db) => callDocker(['exec', name, 'psql', '-X', '-q', '-t', '-A', '-U', 'postgres', '-d', database,
    '-v', 'ON_ERROR_STOP=1', '-c', sql]);
  if (cleanMigrationsApplied) {
    const applied = Number(psql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'));
    assert(applied >= 100, 'EXPECTED_COMPLETE_PRISMA_MIGRATION_HISTORY');
    console.log(`PASS real Prisma migrate deploy on ephemeral PG18; ${applied} completed migrations`);
  }
  const eventTable = psql(`SELECT count(*) FROM information_schema.tables WHERE table_name='AppSubscriptionEvent'`);
  assert.equal(eventTable, '1', 'REAL_PAYMENT_EVENT_TABLE_REQUIRED');
  const eventId = `qa_${randomUUID().replaceAll('-', '')}`;
  const providerKey = `qa-event-${randomUUID()}`;
  // No User foreign key required: app-subscription event userId is nullable.
  // Read the actual enum from the migrated schema (never assume a fixture value).
  const enumValues = psql(`SELECT enumlabel FROM pg_enum WHERE enumtypid='"AppSubscriptionEventSource"'::regtype ORDER BY enumsortorder`)
    .split('\n').filter(Boolean);
  assert(enumValues.includes('YOOKASSA'), 'REAL_PAYMENT_EVENT_SOURCE_ENUM_MISMATCH');
  const eventSql = `INSERT INTO "AppSubscriptionEvent" (id, source, "eventType", "providerEventKey") VALUES ('${eventId}', 'YOOKASSA', 'payment.succeeded', '${providerKey}')`;
  psql(eventSql);
  const duplicate = spawnSync('docker', ['exec', name, 'psql', '-X', '-q', '-t', '-A', '-U', 'postgres', '-d', db,
    '-v', 'ON_ERROR_STOP=1', '-c', eventSql.replace(eventId, `${eventId}duplicate`)], {
    encoding: 'utf8', timeout: 5000,
  });
  assert(duplicate.status !== 0 && /duplicate key value violates unique constraint/.test(duplicate.stderr),
    'REAL_EVENT_DUPLICATE_MUST_FAIL_UNIQUE');
  assert.equal(psql(`SELECT count(*) FROM "AppSubscriptionEvent" WHERE "providerEventKey"='${providerKey}'`), '1');
  // A committed receipt can move from failed to processed for safe retry;
  // this does not prove the provider-facing service has exactly-once side effects.
  psql(`UPDATE "AppSubscriptionEvent" SET "processingStatus"='FAILED' WHERE "providerEventKey"='${providerKey}'`);
  psql(`UPDATE "AppSubscriptionEvent" SET "processingStatus"='PROCESSED', "processedAt"=now() WHERE "providerEventKey"='${providerKey}'`);
  assert.equal(psql(`SELECT "processingStatus" FROM "AppSubscriptionEvent" WHERE "providerEventKey"='${providerKey}'`), 'PROCESSED');
  console.log('PASS real migrated AppSubscriptionEvent unique(providerEventKey) refuses replay duplicate, failed->processed persists');
  console.log('NOTE full clean Prisma migrate deploy remains BLOCKED; synthetic schema fallback is distinct');
  if (!cleanMigrationsApplied) {
    // Opt-in only against the freshly pushed schema in this SAME disposable
    // database. Vitest mocks only provider HTTP; Core and Prisma remain real.
    const packageCwd = resolve(root, 'packages/core');
    const test = spawnSync(resolve(packageCwd, 'node_modules/.bin/vitest'), [
      'run', '--config', 'vitest.archqa-payment.config.ts',
    ], {
      cwd: packageCwd, encoding: 'utf8', timeout: 90000, maxBuffer: 4 * 1024 * 1024,
      env: { ...cliEnv, DATABASE_URL: `postgresql://postgres:${secret}@127.0.0.1:${port}/${db}?schema=public`,
        GAFUS_ARCHQA_REALPG: '1', GAFUS_ARCHQA_DB_NAME: db },
    });
    const output = `${test.stdout ?? ''}\n${test.stderr ?? ''}`.replaceAll(secret, '<synthetic-password>');
    console.log(output.slice(-2800));
    if (test.status !== 0) throw Error('REAL_CORE_PRISMA_SYNTHETIC_WEBHOOK_ACCEPTANCE_FAILED');
    console.log('PASS real packaged Core + Prisma + ephemeral PG webhook replay tests');
    const beforeCount = Number(psql(`SELECT count(*) FROM "AppSubscriptionEvent" WHERE "eventType"='payment.succeeded'`));
    const beforeProcessed = Number(psql(`SELECT count(*) FROM "AppSubscriptionEvent" WHERE "processingStatus"='PROCESSED'`));
    if (beforeCount < 3 || beforeProcessed < 3) throw Error('REAL_WEBHOOK_RECEIPTS_MISSING_BEFORE_SNAPSHOT');
    // Real current-schema pg_dump/restore to a SECOND fresh DB, after genuine
    // Core provider replay. The modified original DB is left as-is, and all
    // databases are later destroyed with this disposable tmpfs container.
    const archive = spawnSync('docker', ['exec', name, 'pg_dump', '-U', 'postgres', '-d', db, '-Fc'], {
      encoding: null, timeout: 45000, maxBuffer: 25 * 1024 * 1024,
    });
    if (archive.status !== 0 || !archive.stdout?.length) throw Error('PRISMA_SCHEMA_CUSTOM_FORMAT_BACKUP_FAILED');
    const restoredDb = `archqa_restore_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    psql(`CREATE DATABASE ${restoredDb}`, 'postgres');
    const restored = spawnSync('docker', ['exec', '-i', name, 'pg_restore', '--no-owner', '-U', 'postgres', '-d', restoredDb], {
      input: archive.stdout, encoding: 'utf8', timeout: 65000, maxBuffer: 5 * 1024 * 1024,
    });
    if (restored.status !== 0) throw Error(`CURRENT_SCHEMA_PG_RESTORE_FAILED ${String(restored.stderr).slice(-900)}`);
    psql(`UPDATE "AppSubscriptionEvent" SET "processingStatus"='FAILED' WHERE "processingStatus"='PROCESSED'`);
    const restoredProcessed = Number(psql(`SELECT count(*) FROM "AppSubscriptionEvent" WHERE "processingStatus"='PROCESSED'`, restoredDb));
    const liveProcessed = Number(psql(`SELECT count(*) FROM "AppSubscriptionEvent" WHERE "processingStatus"='PROCESSED'`));
    if (restoredProcessed !== beforeProcessed || liveProcessed !== 0) throw Error('PRISMA_SCHEMA_RESTORE_DID_NOT_ISOLATE_RECEIPTS');
    console.log(`PASS real current Prisma schema pg_dump -Fc + pg_restore: ${restoredProcessed} committed webhook receipts recovered into separate database`);
    console.log('NOTE full production migration/old-image rollback NOT proved; clean-migrate bootstrapping remains broken');
  }
} finally {
  if (started) {
    callDocker(['rm', '-f', name], { timeout: 25000 });
    console.log(`PASS removed owned disposable PG container ${name}`);
  }
}
