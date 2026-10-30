#!/usr/bin/env node
/** AG4 v4: immutable read-only resumption evidence; NEVER opens a resource lease. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const ROOT = '/Users/asmtv1/Desktop/gafus-refactor';
const check = (ok, label) => { if (!ok) throw new Error(`AG4_V4_FAIL_CLOSED_${label}`); };
check(realpathSync(ROOT) === ROOT, 'ROOT');
const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();
check(git('rev-parse', '--show-toplevel') === ROOT, 'GIT_ROOT');
check(git('branch', '--show-current') === 'vite', 'BRANCH');

function owned(rel) {
  check(typeof rel === 'string' && /^(apps|packages|docs|scripts)\//.test(rel), 'PATH_PREFIX');
  check(rel.split('/').every(p => p && p !== '.' && p !== '..') && !rel.includes('\\'), 'PATH_COMPONENTS');
  const full = resolve(ROOT, rel);
  check(full.startsWith(ROOT + sep), 'PATH_ESCAPE');
  let part = ROOT;
  for (const element of rel.split('/')) {
    part = resolve(part, element);
    check(!lstatSync(part).isSymbolicLink(), 'PATH_SYMLINK');
  }
  check(realpathSync(full) === full && lstatSync(full).isFile(), 'PATH_PHYSICAL');
  return full;
}
function bytes(rel) { return readFileSync(owned(rel)); }
function sha(rel) { return createHash('sha256').update(bytes(rel)).digest('hex'); }
function exact(rel, digest) { check(sha(rel) === digest, 'SHA'); }
function json(rel) { return JSON.parse(bytes(rel).toString('utf8')); }
function pins(mapping, expected, label) {
  check(mapping && Object.keys(mapping).length === expected, label + '_COUNT');
  for (const [file, hash] of Object.entries(mapping)) exact(file, hash);
}

const upgradeFile = 'apps/admin-panel/AG4_REMINDER_144_POSTUPGRADE_CATALOG_LEDGER_INDEPENDENT_ACCEPTANCE_20261018.v1.json';
const zeroFile = 'apps/admin-panel/AG4_REMINDER_144_POSTCLEANUP_FRESH_INDEPENDENT_SELECT_ZERO_REALPG_20261018.json';
const dmmfFile = 'apps/admin-panel/AG4_ROOT_PRISMA_CLIENT_DMMF_AFTER_GENERATE_20261018.json';
const idbFile = 'apps/web-vite/migration/AG2_REMINDER_V2_REAL_CHROME_INDEXEDDB_CAS_WEBLOCKS12_EVIDENCE_20261018.json';
const vetFile = 'apps/admin-panel/AG4_AG2_VET029_INPROCESS_BRIDGE_SOURCE_AND_CONSUMER_PENDING_TOOL_ACCESS_20261018.v1.json';
const authFile = 'apps/admin-panel/AG4_AG3_AUTH011_ACTOR_BOUND_SHARED_AUTHSTORE_ONE_CREDENTIAL_QUEUE_SOURCE_APPROVAL_20261018.v1.json';
const expiryFile = 'apps/admin-panel/AG4_AG1_REMINDER_EXPIRY_PII_TOMBSTONE_ATOMIC_SOURCE_ONLY_GO_20261018.v1.json';
exact(upgradeFile, '7bba4925f0eb18a45e8900577e6b97d5bf91a946d956f33c0f87384adb4ca2ab');
exact(zeroFile, 'f4d6a1edbb62a826bca29395f9c4075bc56ec89338d169c497a7fda068a752f1');
exact(dmmfFile, '3d0685d4b9a84dc3776c1130221c6c5efc807c732ba4d0383d8492f5e8dbacc7');
exact(idbFile, '0d20188a28cc6df47a4e2d135358ebc0639df6b9fcc14ed265e511f3fcac96f2');
exact(vetFile, 'dacd893523c5aa118b3747af30f22f7efb3b1c414711dfe72541ca134067cf59');
exact(authFile, '32e60a04840f6945cdfdfb85ee091690b843a4b700d7b1101ab70e96929b5077');
exact(expiryFile, '423899b9bbd67664da81cca74b0224083605a60f3d4c5fb1018da0bd7126aafd');
exact('packages/prisma/migrations/20261018113000_offline_resource_video_history_additive/migration.sql',
  '695e7d21fa8f794492663013c00bc3c5be77030c9dcfedef39c709347fd15f6d');
const up = json(upgradeFile);
check(up.finishedMigrations === 144 && up.failedMigrations === 0 &&
  up.reminder144MigrationSHA256 === '695e7d21fa8f794492663013c00bc3c5be77030c9dcfedef39c709347fd15f6d', 'UPGRADE');
pins(up.sourceProofSHA256, 4, 'UPGRADE_PROOF');
const zero = json(zeroFile);
check(zero.finishedMigrations === 144 && zero.failedMigrations === 0 && zero.otherSessions === 0 &&
  ['User', 'Reminder', 'OfflineResourceRevision', 'ReminderMutationReceipt',
   'PetCreateReceipt', 'OfflineMutationReceipt', 'PetVetVisit'].every(k => zero[k] === 0), 'CLEANUP_ZERO');
const dm = json(dmmfFile);
check(dm.modelCount === 171 && dm.receiptModel === true &&
  dm.primaryKey?.fields?.join(',') === 'ownerUserId,operationKey', 'DMMF');
const idb = json(idbFile);
pins(idb.sha256Files, 16, 'CHROME_PIN');
check(idb.cases?.length === 12 && idb.cases.every(c => c.status === 'PASS') &&
  idb.execution?.realIndexedDB === true && idb.execution?.realWebLocks === true &&
  idb.execution.HTTPNetwork?.api === 0 && idb.execution.HTTPNetwork?.mutations === 0, 'CHROME_SCOPE');
const vet = json(vetFile);
pins(vet.sourcePins16Current, 16, 'VET_PIN');
check(vet.ag2ConsumerAfterBridge?.state === 'NOT_CREATED_NOT_ACTIVE', 'VET_NOT_GRANTED');
check(!existsSync(resolve(ROOT, 'apps/admin-panel/AG4VetWebInProcessReadBridge20261018.mjs')) &&
  !existsSync(resolve(ROOT, 'apps/admin-panel/AG4_AG2_WEB_VET_INPROCESS_GET_EXCLUSIVE_GRANT_ACTIVE_20261018.v1.json')),
  'VET_BRIDGE_OR_LEASE_CHANGED_FAIL_CLOSED');
const auth = json(authFile);
pins(auth.pinnedStartSourceSHA256, 7, 'AUTH_PIN');
const expiry = json(expiryFile);
pins(expiry.currentBackendSourceSHA256, 4, 'EXPIRY_PIN');
const gates = json('docs/refactor/coordination/GATES.json');
check(gates.gates?.G1_DTO_SEMANTIC?.status === 'PENDING' &&
  gates.gates?.G2_FEATURE_INTEGRATION?.status === 'BLOCKED' &&
  ['PRISMA_GENERATE_MIGRATE','SHARED_DATABASE_REDIS_S3','ROOT_PNPM_LOCKFILE',
   'ROOT_TURBO_BUILD','GIT_WRITES','SHARED_DOCS'].every(k => gates.exclusiveLocks[k]?.state === 'CLOSED'), 'GATES');
const live = v => Number.isFinite(Date.parse(v)) && Date.parse(v) > Date.now();
console.log(JSON.stringify({result:'AG4_V4_READONLY_EVIDENCE_PASS',
  upgrade:'144/144',syntheticTablesZero:7,dmmfModels:171,
  browserStorage:'12/12',idbEvidencePins:16,webVetSourcePins:16,
  ag1ExpirySourcePins:4,ag3CredentialsSourcePins:7,
  ag1ExpiryGrantActiveNow:live(expiry.expiresUTC),
  ag3AuthSourceGrantActiveNow:live(auth.expiresUTC),
  ag2VetConsumerGranted:false,g1:'PENDING',g2:'BLOCKED',
  writes:0,dbOperations:0,productionOperations:0}));
