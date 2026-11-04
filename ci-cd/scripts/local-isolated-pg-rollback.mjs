/**
 * Real PostgreSQL 18 physical pg_dump/pg_restore rehearsal, with a disposable
 * synthetic schema. No user credentials, host ports, network or existing DB.
 * The restore is intentionally into a separate fresh DB; never overwrite live.
 * This does NOT execute the production deploy or attest production rollback.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const image = 'postgres:18-alpine';
const name = `gafus-archqa-rollback-${randomUUID().slice(0, 12)}`;
const env = { ...process.env, DOCKER_DEFAULT_PLATFORM: 'linux/arm64' };
const docker = (args, options = {}) => {
  const result = spawnSync('docker', args, {
    encoding: options.binary ? null : 'utf8',
    timeout: 25_000, maxBuffer: 2 * 1024 * 1024,
    ...(options.input !== undefined ? { input: options.input } : {}), env,
  });
  if (result.status !== 0 || result.error) {
    throw new Error(`DISPOSABLE_DOCKER_FAILURE ${args.slice(0, 4).join(' ')}: ${String(result.stderr ?? result.error).slice(0, 300)}`);
  }
  return result.stdout;
};
const psql = (db, sql) => docker(['exec', name, 'psql', '-X', '-q', '-A', '-t', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-c', sql]).trim();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Some Docker Desktop containerd stores resolve cached IDs but not tag-based
// image inspect. Read the exact cached image ID, never attempt a pull.
const imageList = docker(['image', 'ls', '--format', '{{.ID}} {{.Repository}}:{{.Tag}}']);
const cachedId = imageList.split('\n').find(line => line.endsWith(` ${image}`))?.split(' ')[0];
if (!cachedId) throw new Error('CACHED_POSTGRES_18_REQUIRED_NO_PULL');
const already = spawnSync('docker', ['image', 'inspect', cachedId], { stdio: 'ignore' });
if (already.status !== 0) throw new Error('CACHED_POSTGRES_IMAGE_ID_UNAVAILABLE');
const launch = [
  'run', '--detach', '--pull', 'never', '--name', name,
  '--network', 'none', '--memory', '384m', '--cpus', '1',
  '--tmpfs', '/var/lib/postgresql:rw,exec,size=256m',
  '--tmpfs', '/tmp:rw,exec,size=64m',
  '--env', 'POSTGRES_PASSWORD=gafus_disposable_only',
  '--env', 'POSTGRES_DB=synthetic_before_migration', cachedId,
];
let started = false;
try {
  docker(launch);
  started = true;
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const test = spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'postgres'], { stdio: 'ignore', timeout: 3000 });
    if (test.status === 0) { ready = true; break; }
    await wait(500);
  }
  assert(ready, 'POSTGRES_STARTUP_NOT_READY');
  psql('synthetic_before_migration', `
    CREATE TABLE synthetic_provider_payment (
      provider_event_id TEXT PRIMARY KEY, amount INTEGER NOT NULL CHECK (amount > 0),
      status TEXT NOT NULL CHECK (status IN ('RECEIVED','SUCCEEDED'))
    );
    INSERT INTO synthetic_provider_payment VALUES ('test-payment-1', 105, 'SUCCEEDED');
  `);
  const backup = docker(['exec', name, 'pg_dump', '-U', 'postgres', '-d', 'synthetic_before_migration', '-Fc'], { binary: true });
  assert(Buffer.isBuffer(backup) && backup.length > 100, 'EMPTY_PG_CUSTOM_BACKUP');
  const toc = docker(['exec', '-i', name, 'pg_restore', '--list'], { input: backup });
  assert(toc.includes('synthetic_provider_payment'), 'PG_RESTORE_TOC_MISSING_PAYMENT');
  console.log(`PASS actual pg_dump -Fc + pg_restore --list verified (${backup.length} synthetic bytes)`);
  // Simulate schema incompatibility and a second payment after the verified snapshot.
  psql('synthetic_before_migration', `
    ALTER TABLE synthetic_provider_payment ADD COLUMN only_new_image TEXT DEFAULT 'v2';
    INSERT INTO synthetic_provider_payment VALUES ('test-payment-2', 250, 'SUCCEEDED', 'v2');
  `);
  assert.equal(psql('synthetic_before_migration', 'SELECT count(*) FROM synthetic_provider_payment'), '2');
  psql('postgres', 'CREATE DATABASE synthetic_restored_isolated;');
  docker(['exec', '-i', name, 'pg_restore', '--no-owner', '-U', 'postgres', '-d', 'synthetic_restored_isolated'], { input: backup });
  assert.equal(psql('synthetic_restored_isolated', 'SELECT count(*) FROM synthetic_provider_payment'), '1');
  assert.equal(psql('synthetic_restored_isolated', "SELECT amount FROM synthetic_provider_payment WHERE provider_event_id='test-payment-1'"), '105');
  assert.equal(psql('synthetic_restored_isolated', "SELECT count(*) FROM information_schema.columns WHERE table_name='synthetic_provider_payment' AND column_name='only_new_image'"), '0');
  assert.equal(psql('synthetic_before_migration', 'SELECT count(*) FROM synthetic_provider_payment'), '2');
  // Exactly one durable row per provider event in the restored snapshot.
  psql('synthetic_restored_isolated', `
    INSERT INTO synthetic_provider_payment VALUES ('test-payment-1', 105, 'SUCCEEDED')
    ON CONFLICT (provider_event_id) DO NOTHING;
  `);
  assert.equal(psql('synthetic_restored_isolated', 'SELECT count(*) FROM synthetic_provider_payment'), '1');
  console.log('PASS physical pg_restore into separate DB recovered pre-migration schema/data; source remained changed');
  console.log('PASS PostgreSQL provider_event_id unique constraint refuses duplicate replay row');
  console.log('NOTE production schema migration downgrade and live cutover rollback NOT tested');
} finally {
  if (started) {
    const cleanup = spawnSync('docker', ['rm', '-f', name], { encoding: 'utf8', timeout: 25_000 });
    if (cleanup.status !== 0) {
      console.error(`OWN_SYNTHETIC_CONTAINER_CLEANUP_FAILED ${name}`);
      process.exitCode = 1;
    }
    console.log(`PASS only owned disposable container removed (${name})`);
  }
}
