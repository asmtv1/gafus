/**
 * Opt-in review harness: run an assembled GAFUS bootstrap candidate against
 * ONE NEW disposable Postgres 18 tmpfs instance on random localhost port.
 * Never runs migrate resolve, migrate deploy or touches any existing database.
 * By default ONLY probes free disk; --run explicitly opts in after 12 GiB gate.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const current = dirname(fileURLToPath(import.meta.url));
const candidate = join(current, 'fresh-only-bootstrap.candidate.sql');
const snapshot = JSON.parse(readFileSync(join(current, 'inventory.review.json'), 'utf8'));
const schema = join(root, 'packages/prisma/schema.prisma');
const contents = readFileSync(candidate, 'utf8');
assert.equal(snapshot.purpose, 'REVIEW_ONLY_FRESH_EMPTY_POSTGRES_NEVER_EXISTING_DB');
assert.equal(snapshot.migrationCount, 163);
assert(contents.includes('CREATE TRIGGER "AppSubscriptionPayment_price_snapshot_guard"'));
assert(contents.includes('CREATE TRIGGER "chat2_capture_media_deletion_trigger"'));
assert(!contents.includes('CREATE TABLE "_prisma_migrations"'));
assert(!contents.includes('INSERT INTO "_prisma_migrations"'));

const disk = spawnSync('df', ['-k', root], { encoding: 'utf8', timeout: 3000 });
assert.equal(disk.status, 0, 'DF_DISK_CHECK_FAILED');
const availableKiB = Number(disk.stdout.trim().split('\n').at(-1).trim().split(/\s+/)[3]);
const reserveKiB = 8 * 1024 * 1024;
const scratchMarginKiB = 4 * 1024 * 1024;
const requiredKiB = reserveKiB + scratchMarginKiB;
console.log(`FRESH_BOOTSTRAP_DISK availableKiB=${availableKiB} requiredKiB=${requiredKiB}`);
if (process.argv[2] !== '--run') {
  console.log(availableKiB >= requiredKiB
    ? 'RESOURCE_PROBE_OK: a disposable PG run is eligible with explicit --run'
    : `BLOCKED_DISK: ${requiredKiB - availableKiB} KiB short of 8 GiB reserve + 4 GiB safe scratch margin; DO NOT launch PG`);
  console.log('Command once disk recovers: node ci-cd/bootstrap/prisma-fresh/verify-disposable-pg.mjs --run');
  process.exit(availableKiB >= requiredKiB ? 0 : 2);
}
assert(availableKiB >= requiredKiB,
  `BLOCKED_DISK: ${requiredKiB - availableKiB} KiB short, no Docker started`);
const name = `gafus-archqa-fresh-${randomUUID().slice(0, 12)}`;
const dbName = `archqa_fresh_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const password = `qa_${randomUUID().replaceAll('-', '')}`;
const cli = join(root, 'packages/prisma/node_modules/.bin/prisma');
function docker(args, timeout = 20000) {
  const p = spawnSync('docker', args, { encoding:'utf8', timeout, maxBuffer:2*1024*1024 });
  assert.equal(p.status, 0, `ISOLATED_DOCKER_FAILURE [${args.slice(0,3).join(' ')}] ${String(p.stderr).slice(0,260)}`);
  return p.stdout.trim();
}
const cached = docker(['image','ls','--format','{{.ID}} {{.Repository}}:{{.Tag}}']);
const image = cached.split('\n').find(x => x.endsWith(' postgres:18-alpine'))?.split(' ')[0];
assert(image, 'NO_CACHED_POSTGRES18: no pulls/images/cache deletions are allowed');
let created = false;
try {
  docker(['run','-d','--pull','never','--name',name,
    '--publish','127.0.0.1::5432','--cpus','1','--memory','768m',
    '--tmpfs','/var/lib/postgresql:rw,exec,size=768m',
    '--tmpfs','/tmp:rw,exec,size=64m',
    '-e',`POSTGRES_PASSWORD=${password}`,'-e',`POSTGRES_DB=${dbName}`,image]);
  created = true;
  const port = /^127\.0\.0\.1:(\d+)$/.exec(docker(['port',name,'5432/tcp']))?.[1];
  assert(port,'OWN_RANDOM_LOOPBACK_PORT_REQUIRED');
  for (let tries=0; tries<35; tries++) {
    const ready=spawnSync('docker',['exec',name,'pg_isready','-U','postgres'],
      { stdio:'ignore',timeout:2500 });
    if (ready.status === 0) break;
    if (tries===34) throw Error('OWN_FRESH_PG_NOT_READY');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,300);
  }
  const url=`postgresql://postgres:${password}@127.0.0.1:${port}/${dbName}?schema=public`;
  const psql=query=>docker(['exec',name,'psql','-X','-q','-A','-t',
    '-U','postgres','-d',dbName,'-v','ON_ERROR_STOP=1','-c',query]);
  const initial=Number(psql("SELECT count(*) FROM pg_tables WHERE schemaname='public'"));
  assert.equal(initial,0,'NEVER_TOUCH_NONEMPTY_PG');
  function prisma(args) {
    const p=spawnSync(cli,args,{cwd:root,encoding:'utf8',timeout:90000,
      env:{PATH:process.env.PATH??'', HOME:process.env.HOME??'/',
        NODE_ENV:'test',DATABASE_URL:url,PRISMA_HIDE_UPDATE_MESSAGE:'true'},maxBuffer:3*1024*1024});
    if(p.status !== 0) throw Error(`FRESH_PRISMA_COMMAND_FAILED ${args[0]} ${args[1]}: `+
      `${String(p.stdout)+' '+String(p.stderr)}`.replaceAll(password,'<synthetic-secret>').slice(-1100));
    return p.stdout;
  }
  prisma(['db','execute','--file',candidate,'--url',url]);
  prisma(['migrate','diff','--from-url',url,'--to-schema-datamodel',schema,'--exit-code']);
  const check=(sql,n,label)=>assert.equal(Number(psql(sql)),n,`FRESH_PG_${label}_PARITY`);
  check("SELECT count(*) FROM pg_tables WHERE schemaname='public'",186,'TABLES');
  check("SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype='c'",65,'CUSTOM_CHECKS');
  check("SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal",12,'CUSTOM_TRIGGERS');
  for (const [name,expected] of [
    ['guard_app_subscription_payment_price_snapshot',1],
    ['guard_app_subscription_promo_code_identity',1],
    ['chat2_capture_media_deletion',1],
    ['gafus_course_increment_version',1],
  ]) {
    check(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname='${name}'`,expected,`FUNCTION_${name}`);
  }
  check("SELECT count(*) FROM pg_extension WHERE extname='uuid-ossp'",1,'UUID_EXTENSION');
  check("SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN ('AppSubscription_userId_provider_active_unique','ConsultationBooking_slotId_active_key','Chat2V2MediaTask_cleanup_pending_idx','PetDocument_petId_ownerId_idx','AppSubscription_provider_status_cancelAtPeriodEnd_currentPeriodEnd_idx','AppSubscriptionPayment_subscriptionId_status_succeededAt_idx','StepNotification_active_bound_unique','AppSubscriptionEvent_providerEventKey_unique','AppSubscriptionEvent_idempotencyKey_unique')",9,'EXTRA_INDEXES');
  for (const [table,pk,val] of [
    ['AccountDeletionCounter','id','global'],['AppSubscriptionSettings','key','default'],
    ['RewardedAdSettings','key','default'],['CourseContentRevision','id','1'],
    ['MobileAppReleasePolicy','key','default'],['AppFeatureFlag','key','mobile_rewarded_ads_ios'],
  ]) {
    const typed = /^\d+$/.test(val) ? val : `'${val}'`;
    check(`SELECT count(*) FROM "${table}" WHERE "${pk}" = ${typed}`,1,`SEED_${table}`);
  }
  check("SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='_prisma_migrations'",0,'NO_APPLIED_HISTORY');
  console.log('PASS FRESH ONLY Prisma 186 tables + 65 checks + 12 triggers + 9 indices + 6 seeds; empty datamodel diff');
  console.log('PASS no migration journal marked applied, no production or existing database accessed');
} finally {
  if(created) docker(['rm','-f',name]);
  console.log('PASS only this run own disposable PG container cleaned');
}
