/**
 * Source-only, deterministic, fail-closed review gate for a FRESH-ONLY GAFUS
 * PostgreSQL bootstrap. Never connects to a DB, invokes migrate resolve,
 * records applied history, or modifies the candidate. Use the separate
 * verify-owned-local-pg18.mjs --run only with its own fresh local PG cluster.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const manifest = JSON.parse(readFileSync(join(here, 'inventory.review.json'), 'utf8'));
assert.equal(manifest.purpose, 'REVIEW_ONLY_FRESH_EMPTY_POSTGRES_NEVER_EXISTING_DB');
assert.equal(manifest.migrationCount, 163, 'UNREVIEWED_MIGRATION_SET_SIZE');
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const schema = join(root, 'packages/prisma/schema.prisma');
const baselineSchema = join(here, 'schema-v1.prisma');
const combined = join(here, 'fresh-only-bootstrap.candidate.sql');
assert.equal(sha(baselineSchema), manifest.schemaPrismaSha256, 'FROZEN_BASELINE_SCHEMA_CHANGED');
assert.equal(sha(combined), manifest.combinedSha256, 'CANDIDATE_SQL_DRIFT_REQUIRES_NEW_REVIEW');
for (const [file, field] of [
  ['000-current-prisma-schema.candidate.sql', 'schemaCandidateSha256'],
  ['010-live-historical-invariants.candidate.sql', 'extrasCandidateSha256'],
  ['020-synthetic-singletons.candidate.sql', 'syntheticSeedsSha256'],
]) assert.equal(sha(join(here, file)), manifest[field], `CANDIDATE_SEGMENT_DRIFT:${file}`);
const migrationsPath = join(root, 'packages/prisma/migrations');
const dirs = readdirSync(migrationsPath, { withFileTypes: true })
  .filter(item => item.isDirectory()).map(item => item.name).sort();
assert(dirs.every(name => existsSync(join(migrationsPath, name, 'migration.sql'))),
  'MIGRATION_DIRECTORY_MISSING_SQL');
const reviewed = Object.keys(manifest.migrationsSha256).sort();
const lastBaseline = reviewed.at(-1);
assert.deepEqual(dirs.filter(name => name <= lastBaseline), reviewed,
  'HISTORICAL_MIGRATION_SET_CHANGED_REVIEW_REQUIRED');
const forward = dirs.filter(name => name > lastBaseline);
assert(forward.every(name => /^20\d{12}_[a-zA-Z0-9_-]+$/.test(name) &&
  readFileSync(join(migrationsPath, name, 'migration.sql')).length > 0),
  'FUTURE_MIGRATION_INVALID');
if (forward.length === 0)
  assert.equal(sha(schema), manifest.schemaPrismaSha256,
    'SCHEMA_CHANGED_WITHOUT_FORWARD_MIGRATION');
for (const name of reviewed) {
  assert.equal(sha(join(migrationsPath, name, 'migration.sql')),
    manifest.migrationsSha256[name], `HISTORICAL_MIGRATION_DRIFT:${name}`);
}
const sql = readFileSync(combined, 'utf8');
assert(!/\bCREATE\s+TABLE\s+"?_prisma_migrations"?/i.test(sql),
  'CANDIDATE_MUST_NOT_FORGE_PRISMA_APPLIED_LEDGER');
assert(!/\b(migrate\s+resolve|--applied)\b/i.test(sql),
  'CANDIDATE_MUST_NOT_REGISTER_APPLIED_HISTORY');
function run(command, args, timeout = 25_000) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout,
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '/nonexistent',
      PYTHONDONTWRITEBYTECODE: '1', NODE_ENV: 'test' }, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(result.status, 0, `REVIEW_GATE_FAILED:${command} ${args.join(' ')}\n${String(result.stderr).slice(-1200)}\n${String(result.stdout).slice(-500)}`);
  return result;
}
const verify = run('python3', [join(here, 'assemble.py'), '--verify']);
const contracts = run('python3', ['-m', 'unittest', 'discover', '-s', here,
  '-p', 'test_*.py', '-v']);
run('node', ['--check', join(here, 'verify-owned-local-pg18.mjs')]);
run('node', ['--check', join(here, 'verify-disposable-pg.mjs')]);
run('node', ['--check', join(here, 'apply-new-empty-db.mjs')]);
run('node', ['--check', join(here, 'verify-option-a-pg18.mjs')]);
console.log(verify.stdout.trim().split('\n').at(-1));
const cases = /Ran (\d+) tests/.exec(contracts.stderr)?.[1] ?? 'unknown';
console.log(`PASS BOOTSTRAP_REVIEW_GATE historical_migrations=${reviewed.length} forward_migrations=${forward.length} static_tests=${cases}`);
console.log('PASS frozen baseline SHA256 and 163 historical SQL locked; additive forward SQL allowed; no DB opened');
console.log('OPTIONAL OWNED_PG_ONLY: node ci-cd/bootstrap/prisma-fresh/verify-owned-local-pg18.mjs --run');
console.log('NOT_APPROVED_FOR_EXISTING_DATABASE_OR_PRODUCTION');
