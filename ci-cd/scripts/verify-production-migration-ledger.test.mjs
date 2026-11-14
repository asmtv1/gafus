import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const program = 'ci-cd/scripts/verify-production-migration-ledger.py';
const fixtureRoot = mkdtempSync(join(tmpdir(), 'gafus-ledger-gate-'));
const fixtures = [];
for (let i = 0; i < 163; i++) {
  const name = i===0 ? '20251118_add_trainer_videos' : `20260101000000_synthetic_${String(i).padStart(3, '0')}`;
  const sql = `CREATE TABLE synthetic_${i} (id INTEGER);\n`;
  const directory = join(fixtureRoot, name);
  mkdirSync(directory);
  writeFileSync(join(directory, 'migration.sql'), sql);
  fixtures.push({name, checksum:createHash('sha256').update(sql).digest('hex')});
}
const run = (rows, dir = fixtureRoot) => spawnSync('python3', [program, dir], {
  input:rows.length ? rows.map(r => r.join('\t')).join('\n')+'\n' : '', encoding:'utf8', timeout:15_000,
});
const validRows = () => fixtures.map(x => [x.name, x.checksum, 'applied']);
const deny = (rows, needle) => {
  const result=run(rows);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, new RegExp(needle));
  assert.doesNotMatch(result.stdout, /_PASS:/);
};

test('full synthetic 163-migration ledger matches all local SHA256, pending allowed', () => {
  const rows = validRows();
  const result=run(rows);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /applied=163:pending=0/);
  assert.equal(run([...rows, ['20260101000000_synthetic_000','manual','rolled_back']]).status,0);
});
test('fail closed on checksum mismatch, manual checksum, duplicate, remote-only, failed, truncated ledger', () => {
  const orig=validRows();
  const replace=(i,row)=>orig.map((v,n)=>n===i?row:v);
  deny(replace(1,[orig[1][0], 'f'.repeat(64), 'applied']), 'MIGRATION_SHA_MISMATCH');
  deny(replace(1,[orig[1][0], 'manual', 'applied']), 'NONSTANDARD_MIGRATION_CHECKSUM');
  deny([...orig,orig[1]], 'DUPLICATE_APPLIED_MIGRATION');
  deny([...orig,['20260101000000_nonexistent', 'a'.repeat(64), 'applied']], 'REMOTE_ONLY_MIGRATION');
  deny(replace(1,[orig[1][0], orig[1][1], 'failed']), 'UNFINISHED_MIGRATION');
  deny(orig.slice(0,161), 'APPLIED_MIGRATION_COUNT_TOO_LOW');
  deny([], 'MIGRATION_LEDGER_EMPTY');
});
test('canonical cutover and reusable workflow require pre-mutation ledger gate',()=>{
  const cutover=readFileSync('ci-cd/scripts/production-schema-cutover.sh','utf8');
  const workflow=readFileSync('.github/workflows/production-deploy-reusable.yml','utf8');
  assert.match(cutover, /verify_migration_ledger\(\)/);
  assert.match(cutover, /preflight\)\s+verify_migration_ledger/);
  assert.match(cutover, /prepare\)\s+verify_migration_ledger/);
  assert.match(workflow, /git show "\$CONTROL_SHA:ci-cd\/scripts\/production-schema-cutover\.sh"/);
  assert.match(workflow, /git show "\$CONTROL_SHA:ci-cd\/scripts\/verify-production-migration-ledger\.py"/);
  assert(workflow.indexOf('control-schema-cutover.sh"') < workflow.indexOf('git reset --hard "${{ inputs.release_sha }}"'),
    'ROLLBACK_CONTROL_GUARD_MUST_BE_PRESERVED_BEFORE_TARGET_CHECKOUT');
  assert.match(workflow, /GAFUS_MIGRATION_LEDGER_VERIFIER_PATH="\$RELEASE_BACKUP_DIR\/control-migration-ledger\.py"/);
  assert(workflow.indexOf('control-schema-cutover.sh" preflight') < workflow.indexOf('docker pull "$reference"'),
    'PREDEPLOY_LEDGER_GUARD_MUST_PRECEDE_IMAGE_PULL');
  assert.match(workflow,/control-schema-cutover\.sh" preflight \|\| \{[\s\S]*?git reset --hard "\$\(cat "\$RELEASE_BACKUP_DIR\/previous\.sha"\)"[\s\S]*?exit 1/,
    'LEDGER_VETO_MUST_RESTORE_PREVIOUS_CHECKOUT');
});
test('no connection capabilities in verifier; synthetic resource cleanup',()=>{
  const body=readFileSync(program,'utf8');
  for(const forbidden of ['psycopg','subprocess','os.system','urllib','requests','sqlite3'])
    assert(!body.includes(forbidden),`READONLY_VERIFIER_MUST_NOT_CONNECT:${forbidden}`);
  assert.match(body, /hashlib\.sha256\(path\.read_bytes\(\)\)/);
  rmSync(fixtureRoot,{recursive:true,force:true});
});
