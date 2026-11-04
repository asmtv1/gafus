import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, cpSync, copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  FRESH_V1_MIGRATION_COUNT, FRESH_V1_LAST_BASELINE_MIGRATION,
  verifyFreshV1Source, verifyFreshV1MigrationSequence, verifyOwnedNewDatabaseUrl,
  installFreshV1, assertFreshV1Ledger,
} from './fresh-v1-installer.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(readFileSync(join(here,'inventory.review.json'),'utf8'));
const names=Object.keys(manifest.migrationsSha256).sort();
const root=resolve(here,'../../..');
const allNames=readdirSync(join(root,'packages/prisma/migrations'),{withFileTypes:true})
  .filter(x=>x.isDirectory()).map(x=>x.name).sort();
const forwardNames=verifyFreshV1MigrationSequence(allNames);
const sha=value=>createHash('sha256').update(value).digest('hex');
const allChecksums={...manifest.migrationsSha256};
for(const name of forwardNames)
  allChecksums[name]=sha(readFileSync(join(root,'packages/prisma/migrations',name,'migration.sql')));
const fixture=mkdtempSync(join(tmpdir(),'gafus-fresh-v1-owned-contract-'));
const fixtureSchema=join(fixture,'schema.prisma');
copyFileSync(join(root,'packages/prisma/schema.prisma'),fixtureSchema);
cpSync(join(root,'packages/prisma/migrations'),join(fixture,'migrations'),{recursive:true});
after(()=>rmSync(fixture,{recursive:true,force:true}));
const url='postgresql://qa_0123456789abcdef0123456789abcdef@127.0.0.1:55432/archqa_fresh_123456789abc?schema=public';
const facts="archqa_fresh_123456789abc|127.0.0.1|180004|qa_0123456789abcdef0123456789abcdef|UTF8";
const ledger=(withForward=false)=>(withForward?allNames:names)
  .map(n=>`${n}|${allChecksums[n]}|true|true`).join('\n');
const query=sql=>{
  if(sql.includes('current_database()'))return facts;
  if(sql.includes('EXISTS(SELECT'))return 'f';
  if(sql.includes('pg_tables'))return '186';
  if(sql.includes('pg_trigger'))return '12';
  if(sql.includes('pg_proc'))return '9';
  if(sql.includes('to_regclass'))return 't';
  if(sql.includes('migration_name ||'))return ledger();
  if(sql.includes('count(*) FROM "_prisma_migrations"'))return '163';
  throw Error(`UNMOCKED_QUERY:${sql.slice(0,60)}`);
};
test('frozen source manifest is 163 exact checksums; no historical SQL mutation',()=>{
  assert.equal(FRESH_V1_MIGRATION_COUNT,163);
  assert.deepEqual(verifyFreshV1Source(),names);
});
test('fresh-only URL refuses prod, remote, wrong role, arbitrary DB, auth/extra parameters',()=>{
  assert.equal(verifyOwnedNewDatabaseUrl(url),'archqa_fresh_123456789abc');
  for(const bad of [
    'postgresql://qa_0123456789abcdef0123456789abcdef@localhost:55432/archqa_fresh_123456789abc?schema=public',
    'postgresql://qa_0123456789abcdef0123456789abcdef@db.internal:55432/archqa_fresh_123456789abc?schema=public',
    'postgresql://qa_0123456789abcdef0123456789abcdef@127.0.0.1:55432/gafus_prod?schema=public',
    'postgresql://postgres@127.0.0.1:55432/archqa_fresh_123456789abc?schema=public',
    'postgresql://qa_0123456789abcdef0123456789abcdef@127.0.0.1:5432/archqa_fresh_123456789abc?schema=public&unsafe=true',
    'postgresql://qa_0123456789abcdef0123456789abcdef:secret@127.0.0.1:55432/archqa_fresh_123456789abc?schema=public',
    'postgresql://qa_0123456789abcdef0123456789abcdef@127.0.0.1:55432/archqa_fresh_123456789abc?schema=notpublic',
  ])assert.throws(()=>verifyOwnedNewDatabaseUrl(bad));
});
test('nonempty DB and forged/old ledger block every schema and journal write',()=>{
  let touched=false;
  assert.throws(()=>installFreshV1({databaseUrl:url,schemaFile:fixtureSchema,
    query:sql=>sql.includes('current_database()')?facts:'t',
    applyCandidate:()=>{touched=true;},prisma:()=>{touched=true;}}),/FRESH_ONLY_DATABASE_NOT_EMPTY/);
  assert.equal(touched,false);
});
test('candidate SQL failure prevents any Prisma migration history registration',()=>{
  let count=0;
  assert.throws(()=>installFreshV1({databaseUrl:url,schemaFile:fixtureSchema,query,
    applyCandidate:()=>{throw Error('TRANSACTION_ROLLED_BACK');},prisma:()=>count++}),
  /TRANSACTION_ROLLED_BACK/);
  assert.equal(count,0);
});
test('complete versioned baseline resolves 163 and deploys all future migrations, without direct journal INSERT',()=>{
  const commands=[];
  let didDeploy=false;
  const scopedQuery=sql=>sql.includes('migration_name ||')&&didDeploy?
    ledger(true):query(sql);
  const result=installFreshV1({databaseUrl:url,schemaFile:fixtureSchema,query:scopedQuery,
    applyCandidate:()=>commands.push('SQL_ATOMIC_BOOTSTRAP'),
    prisma:args=>{commands.push(args);if(args[1]==='deploy')didDeploy=true;}});
  assert.equal(result.recorded,163);
  assert.equal(result.forwardApplied,forwardNames.length);
  assert.equal(result.total,allNames.length);
  assert.equal(commands[0],'SQL_ATOMIC_BOOTSTRAP');
  assert.equal(commands.length,166);
  assert.deepEqual(commands.at(-2),['migrate','deploy','--schema',fixtureSchema]);
  assert.deepEqual(commands.at(-1),['migrate','status','--schema',fixtureSchema]);
  assert.deepEqual(commands.slice(1,164).map(x=>x[3]),names);
  assert(commands.slice(1,164).every(x=>x[0]==='migrate'&&x[1]==='resolve'&&x[2]==='--applied'));
  assert.equal(assertFreshV1Ledger(query),163);
});
test('tampered baseline journal fails closed on checksum or state mismatch',()=>{
  const corruptedChecksum=(sql)=>sql.includes('migration_name ||')?
    ledger().replace(manifest.migrationsSha256[names[0]],'f'.repeat(64)):query(sql);
  const unfinished=(sql)=>sql.includes('migration_name ||')?
    ledger().replace('|true|true','|false|true'):query(sql);
  assert.throws(()=>assertFreshV1Ledger(corruptedChecksum),/CHECKSUM_MISMATCH/);
  assert.throws(()=>assertFreshV1Ledger(unfinished),/JOURNAL_UNFINISHED/);
});

test('tampered copied migration is refused BEFORE SQL and Prisma resolve',()=>{
  const target=join(fixture,'migrations',names[0],'migration.sql');
  const original=readFileSync(target);
  let writes=0;
  try {
    writeFileSync(target,Buffer.concat([original,Buffer.from('\n-- deliberate tamper') ]));
    assert.throws(()=>installFreshV1({databaseUrl:url,schemaFile:fixtureSchema,query,
      applyCandidate:()=>writes++,prisma:()=>writes++}),/INSTALL_MIGRATION_COPY_DRIFT/);
    assert.equal(writes,0);
  } finally {writeFileSync(target,original);}
});
test('tampered copied schema is refused BEFORE SQL and journal writes',()=>{
  const original=readFileSync(fixtureSchema);
  let writes=0;
  try {
    writeFileSync(fixtureSchema,Buffer.concat([original,Buffer.from('\n// fixture tamper') ]));
    assert.throws(()=>installFreshV1({databaseUrl:url,schemaFile:fixtureSchema,query,
      applyCandidate:()=>writes++,prisma:()=>writes++}),/INSTALL_SCHEMA_DRIFT/);
    assert.equal(writes,0);
  } finally {writeFileSync(fixtureSchema,original);}
});

test('versioned baseline accepts strictly later future migrations but rejects backdating or missing original',()=>{
  assert.equal(FRESH_V1_LAST_BASELINE_MIGRATION,'20261103180000_step_multiple_video_urls');
  const future='20990101000000_next_safe_schema';
  assert.deepEqual(verifyFreshV1MigrationSequence([...names,future]),[future]);
  assert.throws(()=>verifyFreshV1MigrationSequence([...names,'20261001000000_new_backdated']),
    /BACKDATED_FORWARD_MIGRATION/);
  assert.throws(()=>verifyFreshV1MigrationSequence(names.slice(1)),/HISTORICAL_MIGRATION_MISSING/);
  assert.throws(()=>verifyFreshV1MigrationSequence([...names,names[0]]),/DUPLICATE_MIGRATION_NAME/);
});

test('manual first-install CLI is inert without --apply and explicit owner confirmation',()=>{
  const cli=join(here,'install-fresh-v1-owned-local.mjs');
  const env={PATH:process.env.PATH??'/usr/bin:/bin',HOME:tmpdir()};
  const defaultRun=spawnSync(process.execPath,[cli],{encoding:'utf8',env,timeout:5000});
  assert.equal(defaultRun.status,2);
  assert.match(defaultRun.stdout,/REFUSED/);
  const noFlag=spawnSync(process.execPath,[cli,'--apply'],{encoding:'utf8',env,timeout:5000});
  assert.notEqual(noFlag.status,0);
  assert.match(noFlag.stderr,/EXPLICIT_FRESH_BOOTSTRAP_OPT_IN_REQUIRED/);
  const invalidHost=spawnSync(process.execPath,[cli,'--apply'],{encoding:'utf8',timeout:5000,
    env:{...env,NEW_DB_BOOTSTRAP:'1',
      GAFUS_NEW_DB_BOOTSTRAP_URL:url.replace('127.0.0.1','db.prod.example'),
      GAFUS_NEW_DB_CONFIRM_NAME:'archqa_fresh_123456789abc'}});
  assert.notEqual(invalidHost.status,0);
  assert.match(invalidHost.stderr,/FRESH_ONLY_OWNED_LOOPBACK_REQUIRED/);
});
