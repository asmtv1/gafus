/**
 * Option A / GAFUS fresh-v1 baseline. Only owned NEW loopback PG18 is accepted.
 * Historical migrations remain immutable and are resolved through Prisma CLI;
 * later migrations remain normal forwards for `prisma migrate deploy`.
 * Never deploy this local-only entrypoint against production/existing databases.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=join(here,'../../..');
const inventoryFile=join(here,'inventory.review.json');
const manifest=JSON.parse(readFileSync(inventoryFile,'utf8'));
const lock=JSON.parse(readFileSync(join(here,'fresh-v1.lock.json'),'utf8'));
const baselineNames=Object.keys(manifest.migrationsSha256).sort();
const SHA=input=>createHash('sha256').update(input).digest('hex');
const migrationNamePattern=/^\d{8,14}_[a-zA-Z0-9_]+$/;
export const FRESH_V1_MIGRATION_COUNT=163;
export const FRESH_V1_LAST_BASELINE_MIGRATION=baselineNames.at(-1);

function namesIn(directory) {
  return readdirSync(directory,{withFileTypes:true})
    .filter(item=>item.isDirectory()).map(item=>item.name).sort();
}

/** Forward migration names MUST be later than the immutable baseline. */
export function verifyFreshV1MigrationSequence(names) {
  assert.equal(new Set(names).size,names.length,'FRESH_V1_DUPLICATE_MIGRATION_NAME');
  const actual=[...names].sort();
  for(const name of actual) assert.match(name,migrationNamePattern,'FRESH_V1_INVALID_MIGRATION_NAME');
  for(const name of baselineNames)
    assert(actual.includes(name),`FRESH_V1_HISTORICAL_MIGRATION_MISSING:${name}`);
  const forwards=actual.filter(name=>!Object.hasOwn(manifest.migrationsSha256,name));
  for(const name of forwards) assert(name>FRESH_V1_LAST_BASELINE_MIGRATION,
    `FRESH_V1_BACKDATED_FORWARD_MIGRATION:${name}`);
  return forwards;
}

export function verifyFreshV1Source() {
  assert.equal(lock.strategy,'OPTION_A_FRESH_ONLY');
  assert.equal(lock.version,'gafus-fresh-v1');
  assert.equal(lock.approvedScope,'NEW_EMPTY_LOCAL_OWNED_PG18_ONLY');
  assert.equal(lock.frozenMigrationCount,FRESH_V1_MIGRATION_COUNT);
  assert.equal(lock.lastFrozenMigration,FRESH_V1_LAST_BASELINE_MIGRATION);
  assert.equal(SHA(readFileSync(inventoryFile)),lock.baselineInventorySha256,
    'FRESH_V1_LOCK_INVENTORY_DRIFT');
  assert.equal(manifest.migrationCount,FRESH_V1_MIGRATION_COUNT);
  assert.equal(baselineNames.length,FRESH_V1_MIGRATION_COUNT);
  assert.equal(SHA(readFileSync(join(here,'schema.v1.prisma'))),
    lock.baselineSchemaSnapshotSha256,'FRESH_V1_SCHEMA_SNAPSHOT_DRIFT');
  assert.equal(lock.baselineSchemaSnapshotSha256,manifest.schemaPrismaSha256,
    'FRESH_V1_SCHEMA_SNAPSHOT_NOT_ORIGINAL');
  assert.equal(SHA(readFileSync(join(here,'fresh-only-bootstrap.candidate.sql'))),
    lock.baselineCombinedSqlSha256,'FRESH_V1_BASELINE_SQL_DRIFT');
  assert.equal(lock.baselineCombinedSqlSha256,manifest.combinedSha256,
    'FRESH_V1_SQL_NOT_REVIEWED');
  for(const [file,key] of [
    ['000-current-prisma-schema.candidate.sql','schemaCandidateSha256'],
    ['010-live-historical-invariants.candidate.sql','extrasCandidateSha256'],
    ['020-synthetic-singletons.candidate.sql','syntheticSeedsSha256'],
  ]) assert.equal(SHA(readFileSync(join(here,file))),manifest[key],
    `FRESH_V1_SEGMENT_DRIFT:${file}`);
  const sourceDir=join(root,'packages/prisma/migrations');
  const forwards=verifyFreshV1MigrationSequence(namesIn(sourceDir));
  for(const name of baselineNames) {
    assert.equal(SHA(readFileSync(join(sourceDir,name,'migration.sql'))),
      manifest.migrationsSha256[name],`FRESH_V1_HISTORICAL_SQL_DRIFT:${name}`);
  }
  for(const name of forwards) assert(readFileSync(join(sourceDir,name,'migration.sql')).length>0,
    `FRESH_V1_FORWARD_EMPTY:${name}`);
  return baselineNames;
}

export function verifyOwnedNewDatabaseUrl(databaseUrl) {
  const url=new URL(databaseUrl);
  assert.equal(url.protocol,'postgresql:','FRESH_ONLY_POSTGRES_REQUIRED');
  assert.equal(url.hostname,'127.0.0.1','FRESH_ONLY_OWNED_LOOPBACK_REQUIRED');
  assert.match(url.pathname,/^\/archqa_fresh_[0-9a-f]{12}$/,'FRESH_ONLY_NEW_DB_NAME_REQUIRED');
  assert.match(url.username,/^qa_[0-9a-f]{32}$/,'FRESH_ONLY_OWNED_ROLE_REQUIRED');
  assert.match(url.port,/^\d{2,5}$/,'FRESH_ONLY_PORT_REQUIRED');
  assert.notEqual(url.port,'5432','FRESH_ONLY_REJECT_DEFAULT_DB_PORT');
  assert.equal(url.password,'','FRESH_ONLY_NO_REMOTE_CREDENTIALS');
  assert.equal(url.hash,'','FRESH_ONLY_NO_FRAGMENT');
  assert.deepEqual([...url.searchParams],[['schema','public']],'FRESH_ONLY_PUBLIC_SCHEMA_REQUIRED');
  return url.pathname.slice(1);
}

function requireFreshEmpty(query,target,expectedRole) {
  const facts=query(`SELECT current_database() || '|' || host(inet_server_addr()) || '|' ||
    current_setting('server_version_num') || '|' || current_user || '|' ||
    current_setting('server_encoding')`).split('|');
  assert.equal(facts[0],target,'FRESH_ONLY_TARGET_CHANGED');
  assert.equal(facts[1],'127.0.0.1','FRESH_ONLY_SERVER_NOT_LOOPBACK');
  assert(Number(facts[2])>=180000 && Number(facts[2])<190000,'FRESH_ONLY_REQUIRES_PG18');
  assert.equal(facts[3],expectedRole,'FRESH_ONLY_ROLE_MISMATCH');
  assert.equal(facts[4],'UTF8','FRESH_ONLY_UTF8_REQUIRED');
  const hasObjects=query(`SELECT
    EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public','information_schema')
      AND nspname NOT LIKE 'pg_%') OR
    EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
      WHERE n.nspname='public') OR
    EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace=n.oid
      WHERE n.nspname='public') OR
    EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
      WHERE n.nspname='public') OR
    EXISTS(SELECT 1 FROM pg_extension WHERE extname <> 'plpgsql')`);
  assert.equal(hasObjects,'f','FRESH_ONLY_DATABASE_NOT_EMPTY');
}

function rowsFromJournal(query) {
  return query(`SELECT migration_name || '|' || checksum || '|' ||
    (finished_at IS NOT NULL)::text || '|' || (rolled_back_at IS NULL)::text
    FROM "_prisma_migrations" ORDER BY migration_name`).split('\n').filter(Boolean);
}
function checkLedger(query,expectedNames,expectedSha) {
  const rows=rowsFromJournal(query);
  assert.equal(rows.length,expectedNames.length,'FRESH_V1_JOURNAL_COUNT_MISMATCH');
  for(let i=0;i<expectedNames.length;i++) {
    const [name,checksum,applied,notRolledBack]=rows[i].split('|');
    assert.equal(name,expectedNames[i],`FRESH_V1_JOURNAL_NAME_MISMATCH:${i}`);
    assert.equal(checksum,expectedSha[name],`FRESH_V1_JOURNAL_CHECKSUM_MISMATCH:${name}`);
    assert.equal(applied,'true',`FRESH_V1_JOURNAL_UNFINISHED:${name}`);
    assert.equal(notRolledBack,'true',`FRESH_V1_JOURNAL_ROLLEDBACK:${name}`);
  }
  return rows.length;
}
export function assertFreshV1Ledger(query) {
  return checkLedger(query,baselineNames,manifest.migrationsSha256);
}

/** Callbacks are scoped ONLY to a newly created disposable loopback PG18. */
export function installFreshV1({databaseUrl,schemaFile,query,applyCandidate,prisma}) {
  const target=verifyOwnedNewDatabaseUrl(databaseUrl);
  verifyFreshV1Source();
  // Refuse an existing DB FIRST, even if the caller's copied migration tree
  // contains later test migrations. This branch never executes SQL writes.
  requireFreshEmpty(query,target,new URL(databaseUrl).username);
  const currentSchema=readFileSync(join(root,'packages/prisma/schema.prisma'));
  assert.equal(SHA(readFileSync(schemaFile)),SHA(currentSchema),'FRESH_V1_INSTALL_SCHEMA_DRIFT');
  const sourceDir=join(root,'packages/prisma/migrations');
  const copiedDir=join(dirname(schemaFile),'migrations');
  const expected=namesIn(sourceDir);
  assert.deepEqual(namesIn(copiedDir),expected,'FRESH_V1_INSTALL_MIGRATION_DIR_DRIFT');
  const forwards=verifyFreshV1MigrationSequence(expected);
  const expectedSha={...manifest.migrationsSha256};
  for(const name of forwards) expectedSha[name]=SHA(readFileSync(join(sourceDir,name,'migration.sql')));
  for(const name of expected) assert.equal(
    SHA(readFileSync(join(copiedDir,name,'migration.sql'))),expectedSha[name],
    `FRESH_V1_INSTALL_MIGRATION_COPY_DRIFT:${name}`);
  // Two SQL files MUST be run atomically: precondition+frozen-v1 candidate.
  applyCandidate();
  assert.equal(Number(query(`SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename <> '_prisma_migrations'`)),186,
    'FRESH_V1_BASELINE_TABLE_COUNT_MISMATCH');
  assert.equal(Number(query('SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal')),12,
    'FRESH_V1_BASELINE_TRIGGERS_MISSING');
  assert.equal(Number(query(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
    WHERE n.nspname='public' AND NOT EXISTS (
      SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass
        AND d.objid=p.oid AND d.deptype='e')`)),9,'FRESH_V1_BASELINE_FUNCTIONS_MISSING');
  assert.equal(query(`SELECT to_regclass('public."_prisma_migrations"') IS NULL`),'t',
    'FRESH_V1_PREEXISTING_JOURNAL_FORBIDDEN');
  // Only the historical 163 are resolved. New forward migrations MUST be
  // executed by actual Prisma migrate deploy, not marked applied by inference.
  for(const name of baselineNames)
    prisma(['migrate','resolve','--applied',name,'--schema',schemaFile]);
  assertFreshV1Ledger(query);
  prisma(['migrate','deploy','--schema',schemaFile]);
  prisma(['migrate','status','--schema',schemaFile]);
  const all=[...expected].sort();
  const total=checkLedger(query,all,expectedSha);
  return {recorded:baselineNames.length,forwardApplied:forwards.length,total,targetName:target};
}
