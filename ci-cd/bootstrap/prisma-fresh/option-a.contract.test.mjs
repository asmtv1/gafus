/** Read-only option A security, nonproduction wiring, historic SHA ledger tests. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, cpSync, appendFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allowsFreshPostgresEndpoint } from './postgres-network-policy.mjs';
const read = path => readFileSync(path, 'utf8');
const apply = read('ci-cd/bootstrap/prisma-fresh/apply-new-empty-db.mjs');
const verifier = read('ci-cd/bootstrap/prisma-fresh/verify-option-a-pg18.mjs');
const script = read('packages/prisma/scripts/bootstrap-fresh-postgres.sh');
const workflow = read('.github/workflows/ci-cd.yml');

test('only the exact GitHub Actions disposable Docker service may use a bridge address', () => {
  const valid = {
    address: '172.18.0.2', peer: '172.18.0.1', hostname: 'localhost',
    port: '5432', database: 'gafus_fresh', username: 'gafus_ci',
    githubActions: 'true', ciService: 'github-actions-disposable-postgres-16',
  };
  assert.equal(allowsFreshPostgresEndpoint(valid), true);
  assert.equal(allowsFreshPostgresEndpoint({ ...valid, address: '127.0.0.1',
    githubActions: undefined, ciService: undefined }), true);
  for (const invalid of [
    { githubActions: undefined }, { ciService: undefined },
    { hostname: 'production.example' }, { hostname: '127.0.0.1' },
    { database: 'gafus_prod' }, { username: 'postgres' }, { port: '5433' },
    { address: '172.32.0.2' }, { address: '10.0.0.2' },
    { address: '172.18.1.2' }, { peer: '172.19.0.1' },
    { peer: '127.0.0.1' }, { address: '172.18.0.999' },
  ]) assert.equal(allowsFreshPostgresEndpoint({ ...valid, ...invalid }), false,
    JSON.stringify(invalid));
  assert.match(workflow, /GAFUS_FRESH_CI_POSTGRES_SERVICE: github-actions-disposable-postgres-16/);
  assert.match(apply, /allowsFreshPostgresEndpoint/);
  assert.match(apply, /inet_client_addr/);
});

test('option A has two-phase atomic empty DB guard and never contacts remote DBs', () => {
  assert.match(apply, /REMOTE_DATABASE_FORBIDDEN/);
  assert.match(apply, /LOOPBACK_WRITABLE_POSTGRES_REQUIRED/);
  assert.match(apply, /GAFUS_FRESH_BOOTSTRAP_CONFIRM === database/);
  assert.match(apply, /FRESH_ONLY_DATABASE_NOT_EMPTY_BEFORE_DDL/);
  assert.match(apply, /--single-transaction/);
  assert.match(apply, /fresh-only-precondition\.sql/);
  assert.match(apply, /fresh-only-bootstrap\.candidate\.sql/);
  assert.doesNotMatch(apply, /INSERT INTO\s+"?_prisma_migrations"?/i);
  assert.doesNotMatch(apply, /\bdb push\b/);
});
test('Prisma official resolve preserves historic source SHA and postbaseline deploy', () => {
  assert.match(apply, /review-gate\.mjs/);
  assert.match(apply, /inventory\.migrationsSha256/);
  assert.match(apply, /prismaCommand\('resolve', \['--applied', migrationNames\[i\]\]/);
  assert.match(apply, /BASELINE_JOURNAL_CHECKSUM/);
  // JS .sort() is bytewise for our ASCII migration names. PostgreSQL locale
  // ordering can place 20251118_ before 202511182..., so force C collation.
  assert.equal(apply.split('ORDER BY migration_name COLLATE "C"').length - 1, 2);
  assert.match(apply, /prismaCommand\('status'/);
  assert.match(apply, /prismaCommand\('deploy'/);
  assert.match(verifier, /20990101000000_archqa_fresh_forward_probe/);
  assert.match(verifier, /MIGRATE_DEPLOY/);
});
test('old db push wrapper replaced and CI receives exact new DB confirmation', () => {
  assert.match(script, /apply-new-empty-db\.mjs" --apply/);
  assert.doesNotMatch(script, /^\s*(?:pnpm|npx) .*\bdb push\b/m);
  assert.match(workflow, /GAFUS_FRESH_BOOTSTRAP_CONFIRM: gafus_fresh/);
  assert.match(workflow, /ci-cd\/bootstrap\/prisma-fresh\/review-gate\.mjs/);
  assert.match(workflow, /Bootstrap NEW isolated CI PostgreSQL with SQL and official Prisma baseline/);
});
test('remote URL is rejected before any DB transaction even with confirmation', () => {
  const cmd = spawnSync(process.execPath,
    ['ci-cd/bootstrap/prisma-fresh/apply-new-empty-db.mjs', '--apply'], {
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        HOME: process.env.HOME ?? '/nonexistent',
        DATABASE_URL: 'postgresql://synthetic@production.example:5432/gafus_fresh?schema=public',
        GAFUS_FRESH_BOOTSTRAP_CONFIRM: 'gafus_fresh',
        NODE_ENV: 'test',
      },
      encoding: 'utf8', timeout: 40_000,
    });
  assert.notEqual(cmd.status, 0);
  assert.match(cmd.stderr, /REMOTE_DATABASE_FORBIDDEN/);
  assert.doesNotMatch(cmd.stdout + cmd.stderr, /FRESH_OPTION_A_SCHEMA_PASS/);
});

test('v1 baseline stays frozen when a later Prisma migration and model are appended', () => {
  const temp = mkdtempSync(join(tmpdir(), 'gafus-option-a-v1-forward-own-'));
  try {
    const candidate = join(temp, 'ci-cd/bootstrap/prisma-fresh');
    const sourceMigrations = join(temp, 'packages/prisma/migrations');
    cpSync('ci-cd/bootstrap/prisma-fresh', candidate, { recursive: true });
    cpSync('packages/prisma/migrations', sourceMigrations, { recursive: true });
    const tempSchema = join(temp, 'packages/prisma/schema.prisma');
    cpSync('packages/prisma/schema.prisma', tempSchema);
    appendFileSync(tempSchema, '\nmodel ArchqaFutureOnly { id Int @id }\n');
    const folder = join(sourceMigrations, '20990101000000_qa_forward_only');
    mkdirSync(folder);
    writeFileSync(join(folder, 'migration.sql'),
      'CREATE TABLE "ArchqaFutureOnly" ("id" INTEGER PRIMARY KEY);\n');
    const check = () => spawnSync(process.execPath,
      [join(candidate, 'review-gate.mjs')], {
        cwd: temp, encoding: 'utf8', timeout: 50_000,
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '/nonexistent' },
      });
    const good = check();
    assert.equal(good.status, 0, `${good.stdout}\n${good.stderr}`);
    assert.match(good.stdout, /historical_migrations=163 forward_migrations=1/);
    const old = readdirSync(sourceMigrations).filter(x => x.startsWith('2024')).sort()[0];
    assert(old, 'a frozen historical migration is required');
    appendFileSync(join(sourceMigrations, old, 'migration.sql'), '\n-- TAMPER_TEST_ONLY\n');
    const bad = check();
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /stale candidate|HISTORICAL_MIGRATION_DRIFT|BOOTSTRAP_REVIEW_REQUIRED/i);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
