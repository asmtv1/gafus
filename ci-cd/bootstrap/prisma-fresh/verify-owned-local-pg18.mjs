/**
 * GAFUS fresh-only bootstrap review against OWN ephemeral local PostgreSQL 18.
 * NO Docker/pull, no existing DB, no migration resolve, no production/user data.
 * Default only probes disk and PG binary. --run explicitly starts exactly one
 * local temp cluster in the dedicated architecture-qa scratch directory.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const here = dirname(fileURLToPath(import.meta.url));
const scratch = join(root, '.gafus-refactoring/architecture-qa-20261103-local/bootstrap');
const candidate = join(here, 'fresh-only-bootstrap.candidate.sql');
const schema = join(root, 'packages/prisma/schema.prisma');
const cli = join(root, 'packages/prisma/node_modules/.bin/prisma');
const bin = '/opt/homebrew/opt/postgresql@18/bin';
const exe = name => join(bin, name);
const manifest = JSON.parse(readFileSync(join(here, 'inventory.review.json'), 'utf8'));
assert(manifest.purpose === 'REVIEW_ONLY_FRESH_EMPTY_POSTGRES_NEVER_EXISTING_DB');
assert(manifest.migrationCount === 163);
assert(existsSync(candidate) && existsSync(schema));
for (const command of ['postgres','initdb','pg_ctl','psql','createdb','pg_dump','pg_restore'])
  assert(existsSync(exe(command)), `LOCAL_PG18_BINARY_UNAVAILABLE:${command}`);
const version=spawnSync(exe('postgres'), ['--version'], {encoding:'utf8',timeout:4000});
assert.equal(version.status,0);
assert(/PostgreSQL\) 18\./.test(version.stdout),`ONLY_PG18_IS_SUPPORTED: ${version.stdout.trim()}`);
const df=spawnSync('df',['-k',root],{encoding:'utf8',timeout:3500});
assert.equal(df.status,0,'DISK_PROBE_FAILED');
const availableKiB=Number(df.stdout.trim().split('\n').at(-1).trim().split(/\s+/)[3]);
const neededKiB=12*1024*1024; // 8 GiB preserved, 4 GiB potential own QA scratch.
console.log(`OWN_PG18_FRESH_BOOTSTRAP diskKiB=${availableKiB} minimumKiB=${neededKiB} postgres=${version.stdout.trim()}`);
if(process.argv[2] !== '--run') {
  console.log(availableKiB>=neededKiB
    ? 'PROBE_PASS: eligible for explicit --run; no cluster launched'
    : `BLOCKED_DISK: need ${neededKiB-availableKiB} KiB more; no cluster launched`);
  console.log('Optional: node ci-cd/bootstrap/prisma-fresh/verify-owned-local-pg18.mjs --run');
  process.exit(availableKiB>=neededKiB ? 0 : 2);
}
assert(availableKiB>=neededKiB,'BLOCKED_DISK_NO_CLUSTER_STARTED');
mkdirSync(scratch,{recursive:true});
const working=mkdtempSync(join(scratch,'fresh-pg18-own-'));
const data=join(working,'data');
// No unix socket path: long own scratch path exceeds macOS sun_path.
// This process accepts only loopback TCP on its own random port.
const uid=`qa_${randomUUID().replaceAll('-','')}`;
const db=`archqa_fresh_${randomUUID().replaceAll('-','').slice(0,12)}`;
let started=false;
// Explicit locale prevents PostgreSQL/macOS libintl from launching threads
// in the postmaster before fork; do not rely on a sanitized empty LC_ALL.
const env={PATH:`${bin}:${process.env.PATH??'/usr/bin:/bin'}`, HOME:working,
  LC_ALL:'C', LANG:'C', NODE_ENV:'test', PRISMA_HIDE_UPDATE_MESSAGE:'true',
  PGCONNECT_TIMEOUT:'3', PGAPPNAME:'gafus_refactor_fresh_only_qa'};
function run(name,args,{timeout=12000,allowedFailure=false,extraEnv={}}={}) {
  const p=spawnSync(name,args,{cwd:root,env:{...env,...extraEnv},encoding:'utf8',
    timeout,maxBuffer:2*1024*1024});
  if(!allowedFailure && p.status!==0)throw Error(`OWN_PG18_COMMAND_FAILED:${name.split('/').at(-1)} ${args.slice(0,3).join(' ')} `+
    `${String(p.stderr).slice(-1200)} ${String(p.stdout).slice(-500)}`);
  return p;
}
async function availablePort() {
  const server=createServer();
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
  const addr=server.address();
  assert(addr && typeof addr==='object' && addr.port>0);
  await new Promise(resolve=>server.close(resolve));
  return addr.port;
}
try {
  const port=await availablePort();
  run(exe('initdb'),['-D',data,'--no-instructions','--encoding=UTF8','--no-locale','--auth-local=trust','--auth-host=trust',
    '--username',uid],{timeout:30000});
  // Own config file avoids shell-quoting and Unix socket path-length bugs.
  appendFileSync(join(data,'postgresql.conf'), `\nlisten_addresses = '127.0.0.1'\nport = ${port}\nunix_socket_directories = ''\nmax_connections = 20\nshared_buffers = '32MB'\n`);
  const logfile=join(working,'postgres.log');
  const boot=run(exe('pg_ctl'),['-D',data,'-l',logfile,
    '-w','-t','15','start'],{timeout:27000,allowedFailure:true});
  if (boot.status!==0) {
    const ownLog=existsSync(logfile)?readFileSync(logfile,'utf8').slice(-1700):'OWN_LOG_MISSING';
    throw Error(`OWN_PG18_BOOT_FAILED: ${String(boot.stderr).slice(-360)}\n${ownLog}`);
  }
  started=true;
  run(exe('createdb'),['-h','127.0.0.1','-p',String(port),'-U',uid,db]);
  const psql=query=>run(exe('psql'),['-h','127.0.0.1','-p',String(port),'-U',uid,
    '-d',db,'-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',query],{timeout:10000}).stdout.trim();
  const count=(query,expected,tag)=>assert.equal(Number(psql(query)),expected,`OWN_PG18_${tag}_PARITY`);
  count("SELECT count(*) FROM pg_tables WHERE schemaname='public'",0,'MUST_START_EMPTY');
  assert.equal(psql('SELECT current_database()'),db);
  assert.equal(psql('SHOW server_encoding'),'UTF8','QA_POSTGRES_MUST_USE_UTF8_FOR_GAFUS_NORMALIZE');
  assert(psql('SELECT inet_server_addr()').includes('127.0.0.1'),'ONLY_LOOPBACK_PG_ALLOWED');
  const url=`postgresql://${uid}@127.0.0.1:${port}/${db}?schema=public`;
  const applyFresh = (database, allowedFailure = false) => run(exe('psql'),
    ['-h','127.0.0.1','-p',String(port),'-U',uid,'-d',database,
      '-X','-q','-v','ON_ERROR_STOP=1','--single-transaction',
      '-f',join(here,'fresh-only-precondition.sql'),'-f',candidate],
    {timeout:90000,allowedFailure});
  applyFresh(db);
  const replay = applyFresh(db, true);
  assert(replay.status !== 0 && /FRESH_ONLY_DATABASE_NOT_EMPTY/.test(replay.stderr),
    'FRESH_ONLY_REPLAY_MUST_REFUSE_BEFORE_ANY_DDL');
  count("SELECT count(*) FROM pg_tables WHERE schemaname='public'",186,'REPLAY_NO_SCHEMA_CHANGE');
  console.log('PASS nonempty database refused before candidate DDL, atomic transaction rolled back');
  // A fresh DB with historical raw indexes is intentionally richer than
  // schema.prisma, which cannot represent all custom indexes. Prisma's diff
  // must contain ONLY explicitly documented drops of those extra indexes;
  // claiming it is empty would normalize away preserved historical behavior.
  const migrationDiff = run(cli,['migrate','diff','--from-url',url,
    '--to-schema-datamodel',schema,'--script'],
    {timeout:90000,extraEnv:{DATABASE_URL:url}}).stdout;
  console.log('OWN_FRESH_PG18_DIFF_TO_PRISMA_SCHEMA_ONLY: '+migrationDiff.replace(/\s+/g,' ').slice(0,650));
  const diffSql = migrationDiff.replace(/^--[^\n]*$/gm,'').trim();
  const statements = diffSql.split(';').map(x=>x.trim()).filter(Boolean);
  const allowedExtraIndexes = new Set([
    'PetDocument_petId_ownerId_idx',
    'AppSubscriptionPayment_subscriptionId_status_succeededAt_idx',
  ]);
  const removed = statements.map(x=>/^DROP INDEX "([^"]+)"$/.exec(x)?.[1] ?? null);
  assert(removed.every(Boolean),`UNEXPECTED_PRISMA_SCHEMA_DIFF_SQL: ${diffSql.slice(0,1150)}`);
  assert(removed.length===allowedExtraIndexes.size &&
      removed.every(x=>allowedExtraIndexes.has(x)),
      `UNEXPECTED_PRISMA_SCHEMA_DIFF_INDEXES: ${JSON.stringify(removed)}`);
  console.log('PASS historical custom indexes retained; schema-only diff permits only 2 reviewed raw DROP INDEX statements (NOT executed)');
  count("SELECT count(*) FROM pg_tables WHERE schemaname='public'",186,'TABLE_COUNT');
  count("SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype='c'",65,'CHECK_CONSTRAINTS');
  count("SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal",12,'TRIGGERS');
  count("SELECT count(*) FROM pg_extension WHERE extname='uuid-ossp'",1,'UUID_EXTENSION');
  const functionNames=['guard_app_subscription_payment_price_snapshot',
    'guard_app_subscription_promo_code_identity','prevent_app_subscription_promo_code_event_mutation',
    'chat2_capture_media_deletion','gafus_course_increment_version',
    'gafus_bump_course_content_revision','feed_normalize_profile_city',
    'feed_normalize_breed_key','feed_normalize_pet_breed'];
  for(const f of functionNames) count(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='${f}'`,1,`FUNCTION_${f}`);
  const missingIndices=['AppSubscription_userId_provider_active_unique',
    'AppSubscriptionEvent_providerEventKey_unique','AppSubscriptionEvent_idempotencyKey_unique',
    'ConsultationBooking_slotId_active_key','StepNotification_active_bound_unique',
    'Chat2V2MediaTask_cleanup_pending_idx','PetDocument_petId_ownerId_idx',
    'AppSubscription_provider_status_cancelAtPeriodEnd_currentPeriodEnd_idx',
    'AppSubscriptionPayment_subscriptionId_status_succeededAt_idx'];
  count(`SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN (${missingIndices.map(x=>`'${x}'`).join(',')})`,9,'HISTORICAL_INDICES');
  for (const [table,key,value] of [['AppSubscriptionSettings','key','default'],
    ['RewardedAdSettings','key','default'],['AccountDeletionCounter','id','global'],
    ['CourseContentRevision','id',1],['MobileAppReleasePolicy','key','default'],
    ['AppFeatureFlag','key','mobile_rewarded_ads_ios']]) {
    const val=typeof value==='number'?String(value):`'${value}'`;
    count(`SELECT count(*) FROM "${table}" WHERE "${key}" = ${val}`,1,`STATIC_SEED_${table}`);
  }
  count("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='_prisma_migrations'",0,'NO_APPLIED_JOURNAL');
  // Fail-closed behavioral constraint proof against synthetic singleton only.
  const invalid=run(exe('psql'),['-h','127.0.0.1','-p',String(port),'-U',uid,
    '-d',db,'-X','-q','-v','ON_ERROR_STOP=1','-c',
    'UPDATE "RewardedAdSettings" SET "dailyAdLimit" = 101 WHERE "key" = \'default\';'],
    {allowedFailure:true,timeout:10000});
  assert(invalid.status!==0 && /RewardedAdSettings_daily_limit_allowed/.test(invalid.stderr),
    'FRESH_PG_CHECK_CONSTRAINT_NOT_ENFORCED');
  count('SELECT "dailyAdLimit" FROM "RewardedAdSettings" WHERE "key" = \'default\'',1,'REJECTED_WRITE_DID_NOT_MUTATE');
  // Semantic integration tests: ALL records synthetic, confined to the
  // ephemeral DB that this process initialized. Never query existing DBs.
  const expectSqlFailure = (sql, pattern, tag) => {
    const attempt = run(exe('psql'),['-h','127.0.0.1','-p',String(port),'-U',uid,
      '-d',db,'-X','-q','-v','ON_ERROR_STOP=1','-c',sql],
      {timeout:10000,allowedFailure:true});
    assert(attempt.status !== 0 && pattern.test(attempt.stderr),
      `SQL_GUARD_${tag}_NOT_ENFORCED: ${String(attempt.stderr).slice(-340)}`);
  };
  psql(`INSERT INTO "User" ("id","username","password")
     VALUES ('qa_bootstrap_user','qa_bootstrap_user','synthetic_test_only')`);
  // Historic UserProfile.cityKey + Pet.breedKey SQL trigger semantics.
  psql(`INSERT INTO "UserProfile" ("id","userId","city")
     VALUES ('qa_profile','qa_bootstrap_user','  MoScOw  ')`);
  assert.equal(psql(`SELECT "cityKey" FROM "UserProfile" WHERE "id"='qa_profile'`),'moscow');
  psql(`UPDATE "UserProfile" SET "city"='  DUBLIN ' WHERE "id"='qa_profile'`);
  assert.equal(psql(`SELECT "cityKey" FROM "UserProfile" WHERE "id"='qa_profile'`),'dublin');
  psql(`INSERT INTO "Pet" ("id","ownerId","name","type","breed","birthDate")
    VALUES ('qa_pet','qa_bootstrap_user','Synthetic','DOG','labrador retriever',CURRENT_TIMESTAMP)`);
  assert.equal(psql(`SELECT "breedKey" FROM "Pet" WHERE "id"='qa_pet'`),'лабрадор');
  // Statement-level course revision must increment in the same transaction;
  // rejected writes and rollback cannot leave stale cache revisions.
  psql(`INSERT INTO "Course" ("id","name","type","trainingLevel","duration","logoImg","authorId","updatedAt")
    VALUES ('qa_course','Synthetic course','regular','BEGINNER','1 day','synthetic-only',
     'qa_bootstrap_user',CURRENT_TIMESTAMP)`);
  count(`SELECT "version" FROM "Course" WHERE "id"='qa_course'`,1,'COURSE_VERSION_INSERT');
  count(`SELECT "revision" FROM "CourseContentRevision" WHERE "id"=1`,1,'COURSE_REVISION_INSERT');
  psql(`UPDATE "Course" SET "name"='Synthetic course v2' WHERE "id"='qa_course'`);
  count(`SELECT "version" FROM "Course" WHERE "id"='qa_course'`,2,'COURSE_VERSION_UPDATE');
  count(`SELECT "revision" FROM "CourseContentRevision" WHERE "id"=1`,2,'COURSE_REVISION_UPDATE');
  expectSqlFailure(`UPDATE "Course" SET "version"=100 WHERE "id"='qa_course'`,
    /Course.version is database-managed/, 'COURSE_VERSION_MANUAL_CHANGE');
  count(`SELECT "version" FROM "Course" WHERE "id"='qa_course'`,2,'COURSE_VERSION_AFTER_REJECT');
  count(`SELECT "revision" FROM "CourseContentRevision" WHERE "id"=1`,2,'COURSE_REVISION_AFTER_REJECT');
  psql(`BEGIN; UPDATE "Course" SET "name"='Temporary rolled back' WHERE "id"='qa_course'; ROLLBACK;`);
  count(`SELECT "version" FROM "Course" WHERE "id"='qa_course'`,2,'COURSE_VERSION_ROLLBACK');
  count(`SELECT "revision" FROM "CourseContentRevision" WHERE "id"=1`,2,'COURSE_REVISION_ROLLBACK');
  // Financial snapshot guards must protect the exact amount/discount recorded
  // at checkout independently of Prisma and app-level business services.
  psql(`INSERT INTO "AppSubscriptionPromoCode" ("id","code","normalizedCode",
    "discountPercent","isActive","updatedAt")
    VALUES ('qa_promo','QA10','QA10',10,true,CURRENT_TIMESTAMP)`);
  expectSqlFailure(`UPDATE "AppSubscriptionPromoCode" SET "code"='HACKED'
    WHERE "id"='qa_promo'`, /promo code identity is immutable/,'PROMO_IDENTITY');
  psql(`UPDATE "AppSubscriptionPromoCode" SET "discountPercent"=12,"revision"=2
    WHERE "id"='qa_promo'`);
  count(`SELECT "revision" FROM "AppSubscriptionPromoCode" WHERE "id"='qa_promo'`,2,'PROMO_VALID_REVISION');
  expectSqlFailure(`UPDATE "AppSubscriptionPromoCode" SET "discountPercent"=14
    WHERE "id"='qa_promo'`,/promo code state change must increment revision exactly once/,'PROMO_REVISION');
  psql(`INSERT INTO "AppSubscriptionPromoCodeEvent" ("id","promoCodeId","type",
    "discountPercent","isActive","revision")
    VALUES ('qa_promo_event','qa_promo','CREATED',10,true,1)`);
  expectSqlFailure(`UPDATE "AppSubscriptionPromoCodeEvent" SET "revision"=2
    WHERE "id"='qa_promo_event'`, /promo code events are immutable/,'PROMO_EVENT_IMMUTABILITY');
  psql(`INSERT INTO "AppSubscriptionPayment" ("id","userId","provider","kind",
    "planCode","amount","originalAmount","currency","idempotenceKey","updatedAt")
    VALUES ('qa_payment','qa_bootstrap_user','YOOKASSA','INITIAL',
    'MONTHLY',1000,1000,'RUB','qa_payment_once',CURRENT_TIMESTAMP)`);
  expectSqlFailure(`UPDATE "AppSubscriptionPayment" SET "amount"=1
    WHERE "id"='qa_payment'`, /app subscription payment price snapshot is immutable/,
    'PAYMENT_AMOUNT_SNAPSHOT');
  expectSqlFailure(`UPDATE "AppSubscriptionPayment" SET "originalAmount"=10
    WHERE "id"='qa_payment'`, /app subscription payment price snapshot is immutable/,
    'PAYMENT_ORIGINAL_AMOUNT_SNAPSHOT');
  // Actual raw unique index prevents two active subscriptions on the same
  // provider/user even if the app races through separate processes.
  psql(`INSERT INTO "AppSubscription" ("id","userId","provider","status","updatedAt")
    VALUES ('qa_sub_a','qa_bootstrap_user','YOOKASSA','ACTIVE',CURRENT_TIMESTAMP)`);
  expectSqlFailure(`INSERT INTO "AppSubscription" ("id","userId","provider","status","updatedAt")
    VALUES ('qa_sub_b','qa_bootstrap_user','YOOKASSA','PENDING',CURRENT_TIMESTAMP)`,
    /AppSubscription_userId_provider_active_unique/,'ACTIVE_SUBSCRIPTION_UNIQUENESS');
  psql(`UPDATE "AppSubscription" SET "status"='CANCELED' WHERE "id"='qa_sub_a'`);
  psql(`INSERT INTO "AppSubscription" ("id","userId","provider","status","updatedAt")
    VALUES ('qa_sub_b','qa_bootstrap_user','YOOKASSA','PENDING',CURRENT_TIMESTAMP)`);
  count(`SELECT count(*) FROM "AppSubscription" WHERE "userId"='qa_bootstrap_user'
    AND "status" IN ('ACTIVE','PENDING','PAST_DUE')`,1,'PARTIAL_UNIQUE_LIVE_POLICY');
  // Deleted Chat2 private media must create a durable queue intent from SQL,
  // and a repeated identical object key must re-arm an already-complete intent.
  psql(`INSERT INTO "Chat2Conversation" ("id","kind","createdById","updatedAt")
    VALUES ('qa_room','DIRECT','qa_bootstrap_user',CURRENT_TIMESTAMP)`);
  const newMedia=(id)=>psql(`INSERT INTO "Chat2Media" ("id","conversationId","ownerId",
    "objectKey","name","kind","mime","bytes","status")
    VALUES ('${id}','qa_room','qa_bootstrap_user','private/qa-photo.jpg',
    'qa.jpg','image','image/jpeg',42,'READY')`);
  newMedia('qa_media_1');
  psql(`DELETE FROM "Chat2Media" WHERE "id"='qa_media_1'`);
  count(`SELECT count(*) FROM "Chat2MediaDeletionIntent" WHERE "objectKey"='private/qa-photo.jpg'
    AND "status"='PENDING'`,1,'CHAT2_DELETE_INTENT');
  psql(`UPDATE "Chat2MediaDeletionIntent" SET "status"='DONE',"completedAt"=CURRENT_TIMESTAMP
    WHERE "objectKey"='private/qa-photo.jpg'`);
  newMedia('qa_media_2');
  psql(`DELETE FROM "Chat2Media" WHERE "id"='qa_media_2'`);
  count(`SELECT count(*) FROM "Chat2MediaDeletionIntent" WHERE "objectKey"='private/qa-photo.jpg'
    AND "status"='PENDING' AND "completedAt" IS NULL`,1,'CHAT2_DELETE_REARM');
  // The Chat2 trigger must also run on PostgreSQL FK CASCADE and must
  // participate in rollback (no orphan deletion intent for rolled-back data).
  psql(`INSERT INTO "Chat2Media" ("id","conversationId","ownerId",
    "objectKey","name","kind","mime","bytes","status")
    VALUES ('qa_media_cascade','qa_room','qa_bootstrap_user','private/qa-cascade.jpg',
    'qa.jpg','image','image/jpeg',42,'READY')`);
  psql(`INSERT INTO "Chat2Media" ("id","conversationId","ownerId",
    "objectKey","name","kind","mime","bytes","status")
    VALUES ('qa_media_rollback','qa_room','qa_bootstrap_user','private/qa-rollback.jpg',
    'qa.jpg','image','image/jpeg',42,'READY')`);
  psql(`BEGIN; DELETE FROM "Chat2Media" WHERE "id"='qa_media_rollback'; ROLLBACK;`);
  count(`SELECT count(*) FROM "Chat2MediaDeletionIntent"
    WHERE "objectKey"='private/qa-rollback.jpg'`,0,'CHAT2_DELETE_ROLLBACK_NO_INTENT');
  count(`SELECT count(*) FROM "Chat2Media"
    WHERE "id"='qa_media_rollback'`,1,'CHAT2_DELETE_ROLLBACK_PRESERVES_MEDIA');
  psql(`DELETE FROM "Chat2Conversation" WHERE "id"='qa_room'`);
  count(`SELECT count(*) FROM "Chat2MediaDeletionIntent"
    WHERE "objectKey" IN ('private/qa-cascade.jpg','private/qa-rollback.jpg')
    AND "status"='PENDING'`,2,'CHAT2_FK_CASCADE_DELETION_INTENTS');
  // Duplicate webhook provider keys and idempotence keys are checked by
  // historic partial unique indexes, independent from any service mocks.
  psql(`INSERT INTO "AppSubscriptionEvent" ("id","source","eventType",
    "providerEventKey","idempotencyKey")
    VALUES ('qa_webhook_1','YOOKASSA','payment.succeeded','qa_provider_event_key','qa_webhook_idempotence')`);
  expectSqlFailure(`INSERT INTO "AppSubscriptionEvent" ("id","source","eventType",
    "providerEventKey","idempotencyKey")
    VALUES ('qa_webhook_2','YOOKASSA','payment.succeeded','qa_provider_event_key','different_key')`,
    /AppSubscriptionEvent_providerEventKey_(?:unique|key)/,'WEBHOOK_PROVIDER_KEY_REPLAY');
  expectSqlFailure(`INSERT INTO "AppSubscriptionEvent" ("id","source","eventType",
    "providerEventKey","idempotencyKey")
    VALUES ('qa_webhook_3','YOOKASSA','payment.succeeded','different_event','qa_webhook_idempotence')`,
    /AppSubscriptionEvent_idempotencyKey_(?:unique|key)/,'WEBHOOK_IDEMPOTENCE_REPLAY');
  count(`SELECT count(*) FROM "AppSubscriptionEvent"
    WHERE "providerEventKey"='qa_provider_event_key'`,1,'WEBHOOK_REPLAY_SINGLE_RECEIPT');
  // Replaying idempotent singleton seeds must not overwrite mutable state.
  psql(`UPDATE "RewardedAdSettings" SET "dailyAdLimit"=3 WHERE "key"='default'`);
  run(exe('psql'),['-h','127.0.0.1','-p',String(port),'-U',uid,'-d',db,
    '-X','-q','-v','ON_ERROR_STOP=1','-f',join(here,'020-synthetic-singletons.candidate.sql')]);
  count(`SELECT "dailyAdLimit" FROM "RewardedAdSettings" WHERE "key"='default'`,
    3,'SEED_REPLAY_DOES_NOT_RESET_SETTINGS');
  count(`SELECT count(*) FROM "AccountDeletionCounter" WHERE "id"='global'`,
    1,'SEED_REPLAY_NO_DUPLICATE');
  count(`SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
    AND table_name='_prisma_migrations'`,0,'NO_MIGRATION_JOURNAL_AFTER_BEHAVIOR');
  console.log('PASS REAL PG18 functions/triggers: city+breed normalization; Course version/revision+rollback; promo immutable/revision/event; payment snapshots; Chat2 direct/cascade deletion, re-arm and rollback');
  console.log('PASS REAL PG18 partial indexes: ACTIVE/PENDING exclusive and webhook provider/idempotence replay, invalid CHECK writes rejected, idempotent six-singleton seed replay');
  console.log('PASS ACTUAL OWN PG18 candidate: Prisma schema diff reviewed historical indices only; 186 tables; 65 CHECK; 12 triggers; 9 historical-only indices; 9 functions; 6 seeds');
  // A future additive migration is applied normally, without forging history.
  psql(`CREATE TABLE "BootstrapForwardProbe" ("id" integer PRIMARY KEY,
    "note" text NOT NULL CHECK (length("note") > 0));
    INSERT INTO "BootstrapForwardProbe" VALUES (1, 'synthetic-forward-row');`);
  count('SELECT count(*) FROM "BootstrapForwardProbe"',1,'FORWARD_MIGRATION');
  const dump = join(working,'synthetic.dump');
  run(exe('pg_dump'),['-h','127.0.0.1','-p',String(port),'-U',uid,
    '-d',db,'--format=custom','--file',dump],{timeout:60000});
  const restored = `${db}_restored`;
  run(exe('createdb'),['-h','127.0.0.1','-p',String(port),'-U',uid,restored]);
  run(exe('pg_restore'),['-h','127.0.0.1','-p',String(port),'-U',uid,
    '-d',restored,'--exit-on-error','--single-transaction',dump],{timeout:60000});
  const restoredQuery = query => run(exe('psql'),['-h','127.0.0.1','-p',String(port),
    '-U',uid,'-d',restored,'-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',query]).stdout.trim();
  for (const query of [
    'SELECT "note" FROM "BootstrapForwardProbe" WHERE "id"=1',
    'SELECT count(*) FROM "AppSubscriptionEvent"',
    'SELECT count(*) FROM "Chat2MediaDeletionIntent"',
    'SELECT "dailyAdLimit" FROM "RewardedAdSettings" WHERE "key"=\'default\'',
    "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal",
    "SELECT count(*) FROM pg_constraint WHERE contype='c'",
  ]) assert.equal(restoredQuery(query),psql(query),'SYNTHETIC_RESTORE_PARITY');
  const refusedRestored = applyFresh(restored,true);
  assert(refusedRestored.status !== 0 && /FRESH_ONLY_DATABASE_NOT_EMPTY/.test(refusedRestored.stderr),
    'RESTORED_DATABASE_MUST_REJECT_BOOTSTRAP');
  console.log('PASS additive forward DDL + synthetic pg_dump/pg_restore data, CHECK/trigger parity; restored DB rejects fresh-only replay');
  console.log('PASS no _prisma_migrations and no migration resolve, production untouched');
} finally {
  // Probe by OUR OWN data dir even if pg_ctl timed out after starting.
  const state=existsSync(data) ? run(exe('pg_ctl'),['-D',data,'status'],
    {timeout:4000,allowedFailure:true}) : null;
  if(state?.status===0) {
    run(exe('pg_ctl'),['-D',data,'-m','immediate','-w','-t','12','stop'],{timeout:20000});
  }
  const after=existsSync(data) ? run(exe('pg_ctl'),['-D',data,'status'],
    {timeout:4000,allowedFailure:true}) : null;
  assert(!after || after.status!==0, 'OWN_PG18_STILL_RUNNING_DO_NOT_DELETE_DATA_DIR');
  rmSync(working,{recursive:true,force:true});
  console.log('PASS only this run own disposable PG18 data directory cleaned');
}
