/**
 * Option A actual Prisma migration-history verification. --run creates only an
 * owned, disposable PostgreSQL 18 cluster on a random 127.0.0.1 port.
 * No connection to DATABASE_URL or any preexisting database is ever permitted.
 * Validates real Prisma migrate resolve/deploy/status and a future migration.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFreshV1, verifyFreshV1Source, assertFreshV1Ledger } from './fresh-v1-installer.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const bin = '/opt/homebrew/opt/postgresql@18/bin';
const exe = name => join(bin, name);
const cli = join(root, 'packages/prisma/node_modules/.bin/prisma');
const scratch = join(root, '.gafus-refactoring/architecture-qa-20261103-local/bootstrap');
const runRequested = process.argv.slice(2).join(' ') === '--run';
if (process.argv.length > 3 || (process.argv[2] && !runRequested)) throw Error('USAGE: verify-owned-baseline-pg18.mjs [--run]');
for (const name of ['postgres','initdb','pg_ctl','createdb','psql'])
  assert(existsSync(exe(name)), `OWN_LOCAL_PG18_MISSING:${name}`);
assert(existsSync(cli), 'LOCAL_PRISMA_CLI_MISSING');
const version = spawnSync(exe('postgres'), ['--version'], { encoding: 'utf8', timeout: 5000 });
assert(version.status === 0 && /PostgreSQL\) 18\./.test(version.stdout), 'OWN_PG18_VERSION_REQUIRED');
const free = Number(spawnSync('df',['-k',root],{encoding:'utf8',timeout:5000})
  .stdout.trim().split('\n').at(-1).trim().split(/\s+/)[3]);
assert(Number.isFinite(free), 'OWN_LOCAL_DISK_CHECK_REQUIRED');
console.log(`OWN_PRISMA_BASELINE_PROBE freeKiB=${free} thresholdKiB=${12*1024*1024} postgres=${version.stdout.trim()}`);
if (!runRequested) {
  console.log('PROBE_ONLY: use --run to create one isolated cluster; never uses production DATABASE_URL');
  process.exit(free >= 12*1024*1024 ? 0 : 2);
}
assert(free >= 12*1024*1024, 'OWN_PG18_BASELINE_DISK_GUARD');
verifyFreshV1Source();
mkdirSync(scratch,{recursive:true});
const working = mkdtempSync(join(scratch,'fresh-history-own-'));
const data = join(working,'pgdata');
const uid = `qa_${randomUUID().replaceAll('-','')}`;
const db = `archqa_fresh_${randomUUID().replaceAll('-','').slice(0,12)}`;
const env = {
  PATH:`${bin}:${process.env.PATH??'/usr/bin:/bin'}`, HOME:working,
  LC_ALL:'C', LANG:'C', NODE_ENV:'test', PRISMA_HIDE_UPDATE_MESSAGE:'true',
  PGCONNECT_TIMEOUT:'3', PGAPPNAME:'gafus_refactor_fresh_history_owned_qa',
};
function run(command,args, {extraEnv={}, timeout=20000, allowFailure=false}={}) {
  const result = spawnSync(command,args,{cwd:root,env:{...env,...extraEnv},
    encoding:'utf8',timeout,maxBuffer:4*1024*1024});
  if (!allowFailure && result.status !== 0) {
    // NEVER print the database URL or any process environment variables.
    throw Error(`FRESH_V1_COMMAND_FAILED:${command.split('/').at(-1)} ` +
      `${String(result.stderr).slice(-900)} ${String(result.stdout).slice(-400)}`);
  }
  return result;
}
async function randomPort() {
  const server = createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const addr=server.address();assert(addr && typeof addr==='object' && addr.port>0);
  await new Promise(resolve=>server.close(resolve));return addr.port;
}
try {
  const port = await randomPort();
  run(exe('initdb'),['-D',data,'--no-instructions','--encoding=UTF8','--no-locale',
    '--auth-local=trust','--auth-host=trust','--username',uid],{timeout:30000});
  appendFileSync(join(data,'postgresql.conf'),
    `\nlisten_addresses = '127.0.0.1'\nport = ${port}\nunix_socket_directories = ''\nmax_connections = 20\nshared_buffers = '32MB'\n`);
  const logfile=join(working,'pg.log');
  const started=run(exe('pg_ctl'),['-D',data,'-l',logfile,'-w','-t','15','start'],
    {timeout:27000,allowFailure:true});
  if (started.status!==0) throw Error(`OWN_CLUSTER_BOOT_FAILED:${readFileSync(logfile,'utf8').slice(-900)}`);
  const pgArgs=['-h','127.0.0.1','-p',String(port),'-U',uid];
  run(exe('createdb'),[...pgArgs,db]);
  const query=(sql,database=db)=>run(exe('psql'),[...pgArgs,'-d',database,
    '-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',sql],{timeout:15000}).stdout.trim();
  const schemaDir=join(working,'schema');
  mkdirSync(schemaDir,{recursive:true});
  const schemaFile=join(schemaDir,'schema.prisma');
  copyFileSync(join(root,'packages/prisma/schema.prisma'),schemaFile);
  cpSync(join(root,'packages/prisma/migrations'),join(schemaDir,'migrations'),{recursive:true});
  const url=`postgresql://${uid}@127.0.0.1:${port}/${db}?schema=public`;
  let count=0;
  const prisma=args=>{
    const result=run(cli,args,{extraEnv:{DATABASE_URL:url},timeout:45000});
    if (args[1]==='resolve') {count++;if(count%25===0 || count===163)
      console.log(`PRISMA_BASELINE_RESOLVED ${count}/163`);}
    return result.stdout;
  };
  const applyCandidate=()=>run(exe('psql'),[...pgArgs,'-d',db,'-X','-q','-v','ON_ERROR_STOP=1',
    '--single-transaction','-f',join(here,'fresh-only-precondition.sql'),
    '-f',join(here,'fresh-only-bootstrap.candidate.sql')],{timeout:100000});
  const accepted=installFreshV1({databaseUrl:url,schemaFile,query,applyCandidate,prisma});
  assert.equal(accepted.recorded,163);
  assert.equal(query('SELECT count(*) FROM "_prisma_migrations"'),'163');
  console.log('PASS REAL PRISMA 163 historical checksum-matched rows via migrate resolve; deploy/status 0 pending');
  // Prisma schema cannot express two preserved historical extra indexes.
  // They are the ONLY allowed diff here; don't apply these suggested drops.
  const drift=prisma(['migrate','diff','--from-url',url,
    '--to-schema-datamodel',schemaFile,'--script']);
  const statements=drift.replace(/^--[^\n]*$/gm,'').trim().split(';')
    .map(x=>x.trim()).filter(Boolean);
  const keptIndexes=new Set([
    'PetDocument_petId_ownerId_idx',
    'AppSubscriptionPayment_subscriptionId_status_succeededAt_idx',
  ]);
  const proposedDrops=statements.map(sql=>/^DROP INDEX \"([^\"]+)\"$/.exec(sql)?.[1]);
  assert(proposedDrops.length===keptIndexes.size &&
    proposedDrops.every(name=>keptIndexes.has(name)),
    `FRESH_V1_SCHEMA_PARITY_DRIFT:${statements.join(';').slice(0,800)}`);
  console.log('PASS Prisma schema parity: only two preserved historical raw indexes differ; no DROP executed');
  // Real forward migration, written ONLY to the copied scratch migration dir.
  const next='20990101000000_archqa_fresh_baseline_forward_probe';
  const nextDir=join(schemaDir,'migrations',next);
  mkdirSync(nextDir,{recursive:true});
  writeFileSync(join(nextDir,'migration.sql'),
    'CREATE TABLE "BootstrapHistoryForwardProbe" ('+
      '"id" integer PRIMARY KEY, "note" text NOT NULL CHECK (length("note") > 0));\n'+
    `INSERT INTO "BootstrapHistoryForwardProbe" ("id","note") VALUES (1,'synthetic-post-baseline');\n`);
  const migrated=prisma(['migrate','deploy','--schema',schemaFile]);
  assert(migrated.includes(next), 'FORWARD_PRISMA_MIGRATE_DEPLOY_NOT_APPLIED');
  assert.equal(query('SELECT "note" FROM "BootstrapHistoryForwardProbe" WHERE "id"=1'),
    'synthetic-post-baseline');
  assert.equal(query('SELECT count(*) FROM "_prisma_migrations"'),'164');
  const status=prisma(['migrate','status','--schema',schemaFile]);
  assert(/up to date/i.test(status), 'FORWARD_PRISMA_MIGRATE_STATUS_NOT_UP_TO_DATE');
  console.log('PASS REAL future migration deployed 164/164, status up-to-date, synthetic data present');
  // Re-running the installer against an existing baseline (or any DB with
  // ownership data) must refuse BEFORE changing SQL or migration journal.
  const before=query('SELECT count(*) FROM "_prisma_migrations"');
  assert.throws(()=>installFreshV1({databaseUrl:url,schemaFile,query,applyCandidate,prisma}),
    /FRESH_ONLY_DATABASE_NOT_EMPTY/);
  assert.equal(query('SELECT count(*) FROM "_prisma_migrations"'),before);
  assert.equal(query('SELECT "note" FROM "BootstrapHistoryForwardProbe" WHERE "id"=1'),
    'synthetic-post-baseline');
  const existing=`archqa_fresh_${randomUUID().replaceAll('-','').slice(0,12)}`;
  run(exe('createdb'),[...pgArgs,existing]);
  query('CREATE TABLE "DoNotAlterUserData" ("id" integer PRIMARY KEY); INSERT INTO "DoNotAlterUserData" VALUES (7)',existing);
  const existingUrl=`postgresql://${uid}@127.0.0.1:${port}/${existing}?schema=public`;
  assert.throws(()=>installFreshV1({databaseUrl:existingUrl,schemaFile,
    query:sql=>query(sql,existing),applyCandidate:()=>{throw Error('WRITES_FORBIDDEN');},
    prisma:()=>{throw Error('RESOLVE_FORBIDDEN');}}),/FRESH_ONLY_DATABASE_NOT_EMPTY/);
  assert.equal(query('SELECT "id" FROM "DoNotAlterUserData"',existing),'7');
  assert.equal(query('SELECT to_regclass(\'public."_prisma_migrations"\') IS NULL',existing),'t');
  console.log('PASS baseline refuses replay and populated DB; user data and 164-row migration ledger intact');
  console.log('PASS Option A fresh PG18 + actual Prisma migration history: local-owned only; no prod/data/history touched');
} finally {
  const status=existsSync(data) ? run(exe('pg_ctl'),['-D',data,'status'],
    {timeout:5000,allowFailure:true}) : null;
  if (status?.status===0) run(exe('pg_ctl'),['-D',data,'-m','immediate','-w','-t','12','stop'],{timeout:22000});
  const stopped=existsSync(data) ? run(exe('pg_ctl'),['-D',data,'status'],
    {timeout:5000,allowFailure:true}) : null;
  assert(!stopped || stopped.status!==0, 'OWN_CLUSTER_STILL_RUNNING_REFUSE_DELETION');
  rmSync(working,{recursive:true,force:true});
  console.log('PASS owned ephemeral PostgreSQL18 cluster stopped and only owned scratch removed');
}
