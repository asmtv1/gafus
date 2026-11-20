import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { readWorktreeFingerprint, sameWorktreeFingerprint } from './worktree-fingerprint.mjs';
import { selectWebE2eExecution } from './web-e2e-mode.mjs';
import { discoverWebTests, generateWebViteGroups } from '../../scripts/qa/web-vite-groups.mjs';
const root = resolve(import.meta.dirname, '../..');
const cli = resolve(root, 'scripts/qa/test-system.mjs');
const run = (...args) => spawnSync(process.execPath, [cli, ...args],
  { cwd:root, encoding:'utf8', timeout:15000 });
function plan(...args) {
  const result = run('plan',...args);
  assert.equal(result.status,0,result.stderr || result.stdout);
  const match = result.stdout.match(/PLAN (\S+\/plan\.json) fingerprint=/);
  assert.ok(match,result.stdout);
  return JSON.parse(readFileSync(resolve(root,match[1]),'utf8'));
}
test('same package plan binds the source snapshot and keeps distinct execution IDs',()=>{
  const a=plan('--profile','unit','--package','@gafus/core');
  const b=plan('--profile','unit','--package','@gafus/core');
  // On a concurrently edited checkout the two source snapshots may differ.
  // Equality is mandatory only for identical snapshots; drift MUST change the plan fingerprint.
  if (sameWorktreeFingerprint(a.sourceState,b.sourceState))
    assert.equal(a.fingerprint,b.fingerprint);
  else
    assert.notEqual(a.fingerprint,b.fingerprint);
  assert.notEqual(a.runId,b.runId);
  assert.deepEqual(a.tasks.map((t)=>t.id),['workspace.unit.@gafus/core']);
});
test('unknown package is an error, not an empty successful run',()=>{
  const r=run('plan','--package','@gafus/does-not-exist');
  assert.equal(r.status,2);
  assert.match(r.stderr,/Unknown workspace/);
});
test('missing comparison base expands the plan instead of silently passing',()=>{
  const p=plan('--profile','ci','--base','origin/nonexistent-ref-for-test');
  assert.equal(p.selection.mode,'fallback-full');
  assert.ok(p.tasks.some((t)=>t.owner==='@gafus/core'));
});
test('mobile profile routes both scenarios to the selected platform',()=>{
  const p=plan('--profile','e2e:mobile','--platform','ios');
  assert.deepEqual(p.tasks.filter(t=>t.command?.includes('scripts/qa/mobile-maestro-run.mjs')).map(t=>t.id),
    ['mobile.ota.ios','mobile.training.ios']);
  assert.ok(!p.tasks.some((t)=>t.platform==='android'));
});

test('web-vite package is partitioned into exhaustive named, required groups',()=>{
  const a=plan('--profile','web-vite');
  const b=plan('--profile','unit','--package','@gafus/web-vite');
  assert.equal(a.tasks.length,b.tasks.length);
  assert.ok(a.tasks.length>20);
  assert.deepEqual(a.tasks.map(t=>t.id),b.tasks.map(t=>t.id));
  const manifest=JSON.parse(readFileSync(resolve(root,'tests/catalog/web-vite-groups.json'),'utf8'));
  const planned=a.tasks.flatMap(t=>t.expectedFiles||[]).sort();
  const expected=manifest.groups.flatMap(g=>g.files.map(f=>'apps/web-vite/'+f)).sort();
  assert.deepEqual(planned,expected);
  const found=discoverWebTests(resolve(root,'apps/web-vite'));
  assert(found.length>=300,'WEB_TEST_DISCOVERY_SHRANK_BELOW_REVIEWED_MINIMUM');
  assert.deepEqual(manifest.groups,generateWebViteGroups(found));
  assert.equal(planned.length,found.length+1); // 1 node vite.config.test.mjs
  assert.ok(a.tasks.every(t=>t.reportEnv==='VITEST_REPORT_PATH' && t.timeoutMs>=20*60_000));
  assert.ok(!a.tasks.some(t=>t.command?.includes('test'))); // no monolithic pnpm test
});

test('native preflight is a single informational task requiring incomplete device receipt',()=>{
 const p=plan('--profile','native-preflight');
 assert.equal(p.tasks.length,1);
 assert.equal(p.tasks[0].id,'mobile.maestro.preflight');
 assert.equal(p.tasks[0].kind,'native-preflight');
 assert.equal(p.tasks[0].nativePreflight,true);
 assert.equal(p.tasks[0].nativeReportEnv,'GAFUS_NATIVE_PREFLIGHT_REPORT');
 assert.match(p.tasks[0].completionExpectation,/incomplete/);
 assert.deepEqual(p.tasks[0].command,['node','scripts/qa/mobile-e2e-preflight.mjs','--strict']);
});

test('payment and Worker fault profiles are named, isolated and excluded from required CI/full plans',()=>{
 const p=plan('--profile','faults');
 assert.deepEqual(p.tasks.map(t=>t.id),['payment.failures.pg','worker.failures.pg']);
 assert.ok(p.tasks.every(t=>t.kind==='faults' && t.status==='ready' &&
   t.resources.includes('disposable-postgres18') && t.reportEnv==='GAFUS_TEST_REPORT_PATH' &&
   t.format==='vitest-json' && t.expectedCases.length>=2));
 assert.deepEqual(plan('--profile','faults','--scenario','payment.failures').tasks.map(t=>t.id),['payment.failures.pg']);
 assert.deepEqual(plan('--profile','faults','--scenario','worker.failures').tasks.map(t=>t.id),['worker.failures.pg']);
 assert.ok(!plan('--profile','ci').tasks.some(t=>t.kind==='faults'));
 assert.ok(!plan('--profile','full').tasks.some(t=>t.kind==='faults'));
});


test('risk coverage pilot is explicit, with source files pinned and never a required CI/full check',()=>{
 const baseline=JSON.parse(readFileSync(resolve(root,'tests/catalog/coverage-risk-baseline.json'),'utf8'));
 const p=plan('--profile','coverage-risk');
 assert.deepEqual(p.tasks.map(t=>t.id),['coverage.payment.pg','coverage.worker.pg']);
 for(const t of p.tasks){
   assert.equal(t.kind,'coverage-risk');assert.equal(t.status,'ready');
   assert.equal(t.reportEnv,'GAFUS_TEST_REPORT_PATH');
   assert.equal(t.format,'vitest-json');
   assert.ok(t.expectedCases.length>=2 && t.resources.includes('isolated-postgres18-db-push'));
   assert.deepEqual(t.coverageSources,Object.values(baseline.targets[t.riskDomain].groups).flat());
 }
 assert.deepEqual(plan('--profile','coverage-risk','--scenario','coverage.payment').tasks.map(x=>x.id),['coverage.payment.pg']);
 assert.deepEqual(plan('--profile','coverage-risk','--scenario','coverage.worker').tasks.map(x=>x.id),['coverage.worker.pg']);
 for(const profile of ['ci','full','integration'])
   assert.ok(!plan('--profile',profile).tasks.some(x=>x.kind==='coverage-risk'));
});

test('targeted transition and webhook risk assertions stay named and original baseline stays immutable',()=>{
 const base=JSON.parse(readFileSync(resolve(root,'tests/catalog/coverage-risk-baseline.json'),'utf8'));
 const prev=JSON.parse(readFileSync(resolve(root,'tests/catalog/coverage-risk-baseline-pre-transition-20261119.json'),'utf8'));
 assert.equal(base.previousBaseline.file,'tests/catalog/coverage-risk-baseline-pre-transition-20261119.json');
 const p=base.sources['packages/subscription-payment-server/src/paymentService.ts'];
 const q=prev.sources['packages/subscription-payment-server/src/paymentService.ts'];
 const t=base.sources['packages/subscription-payment-server/src/subscriptionTransitions.ts'];
 const u=prev.sources['packages/subscription-payment-server/src/subscriptionTransitions.ts'];
 assert.equal(p.lines.total,q.lines.total);assert.equal(p.branches.total,q.branches.total);
 assert.equal(t.lines.total,u.lines.total);assert.equal(t.branches.total,u.branches.total);
 assert.equal(p.sourceSha256,q.sourceSha256);assert.equal(t.sourceSha256,u.sourceSha256);
 assert.ok(p.lines.covered>q.lines.covered && p.branches.covered>q.branches.covered);
 assert.ok(t.lines.covered>u.lines.covered && t.branches.covered>u.branches.covered);
 const tasks=plan('--profile','coverage-risk').tasks;
 const payment=tasks.find(x=>x.id==='coverage.payment.pg');
 assert.equal(payment.expectedCases.length,17);
 assert.ok(payment.expectedCases.includes('two simultaneous card bindings yield one trial grant and one denied trial'));
 assert.ok(payment.expectedCases.includes('late full refund of an older payment leaves a newer succeeded period active'));
 assert.ok(payment.expectedCases.includes('cross-account provider metadata cannot grant entitlement even with valid incoming webhook metadata'));
 assert.equal(new Set(payment.expectedCases).size,payment.expectedCases.length);
});

test('real Redis + BullMQ SIGKILL recovery is advisory only, with owned isolated resources and named evidence',()=>{
  const p=plan('--profile','recovery');
  assert.equal(p.tasks.length,1);
  const t=p.tasks[0];
  assert.equal(t.id,'worker.redis-recovery.pg-redis');
  assert.equal(t.kind,'recovery');
  assert.equal(t.status,'ready');
  assert.equal(t.format,'qa-real-process-evidence-json');
  assert.equal(t.reportEnv,'GAFUS_TEST_REPORT_PATH');
  assert.deepEqual(t.command,['bash','scripts/qa/worker-redis-recovery-isolated.sh']);
  assert.equal(t.expectedCases.length,3);
  assert.ok(t.resources.includes('owned-child-bullmq-worker'));
  assert.ok(t.resources.includes('owned-loopback-redis-aof'));
  assert.deepEqual(plan('--profile','recovery','--scenario','worker.redis-recovery').tasks.map(x=>x.id),[t.id]);
  for(const profile of ['ci','full','integration','faults','coverage-risk'])
    assert.equal(plan('--profile',profile).tasks.some(x=>x.kind==='recovery'),false);
});

test('real authenticated HTTP Hono/PG/Redis QA is named, isolated and never a mandatory release gate',()=>{
 const p=plan('--profile','api-acceptance');assert.equal(p.tasks.length,1);
 const t=p.tasks[0];assert.equal(t.id,'api.authenticated-http.pg');
 assert.equal(t.kind,'api-acceptance');assert.equal(t.status,'ready');
 assert.equal(t.reportEnv,'GAFUS_TEST_REPORT_PATH');assert.equal(t.format,'qa-http-sql-json');
 assert.deepEqual(t.command,['bash','scripts/qa/api-authenticated-http-isolated.sh']);
 assert.equal(t.expectedCases.length,9);
 assert.ok(t.resources.includes('owned-loopback-postgresql18-db-push'));
 assert.ok(t.resources.includes('real-hono-tcp-loopback'));
 assert.deepEqual(plan('--profile','api-acceptance','--scenario','api.authenticated-http').tasks.map(x=>x.id),[t.id]);
 for(const name of ['ci','full','integration','faults','recovery','coverage-risk'])
   assert.ok(!plan('--profile',name).tasks.some(x=>x.kind==='api-acceptance'),name);
});

test('existing personal Chrome cookie/refresh HTTP+SQL acceptance is isolated advisory only',()=>{
  const p=plan('--profile','browser-cookie');
  assert.equal(p.tasks.length,1);
  const t=p.tasks[0];
  assert.equal(t.id,'api.browser-cookie.chrome-pg-redis');
  assert.equal(t.kind,'browser-cookie');
  assert.equal(t.status,'ready');
  assert.equal(t.format,'qa-chrome-cookie-http-sql-json');
  assert.equal(t.reportEnv,'GAFUS_TEST_REPORT_PATH');
  assert.deepEqual(t.command,['bash','scripts/qa/api-browser-cookie-isolated.sh']);
  assert.equal(t.expectedCases.length,13);
  assert.ok(t.resources.includes('existing-user-chrome-extension-owned-tabs-only'));
  assert.ok(t.resources.includes('owned-loopback-postgresql18-db-push'));
  assert.deepEqual(plan('--profile','browser-cookie','--scenario','api.browser-cookie-session').tasks.map(x=>x.id),[t.id]);
  for(const profile of ['ci','full','integration','faults','recovery','coverage-risk','api-acceptance'])
    assert.equal(plan('--profile',profile).tasks.some(x=>x.kind==='browser-cookie'),false);
});

test('original-Web account-delete Chrome/Hono/PostgreSQL audit is an opt-in advisory profile only',()=>{
 const selected=plan('--profile','account-delete-web');
 assert.equal(selected.tasks.length,1);
 const t=selected.tasks[0];
 assert.equal(t.id,'api.account-delete.real-web-hono-sql');
 assert.equal(t.kind,'account-delete-web');
 assert.equal(t.status,'ready');
 assert.equal(t.format,'qa-web-hono-postgres-delete-json');
 assert.equal(t.reportEnv,'GAFUS_TEST_REPORT_PATH');
 assert.deepEqual(t.command,['bash','scripts/qa/api-account-delete-web-isolated.sh']);
 assert.equal(t.expectedCases.length,10);
 assert.ok(t.resources.includes('original-vite-web-ui'));
 assert.ok(t.resources.includes('original-hono-account-delete-api'));
 assert.ok(t.resources.includes('durable-account-deletion-audit'));
 assert.deepEqual(plan('--profile','account-delete-web','--scenario','api.account-delete-real-web')
   .tasks.map(x=>x.id),[t.id]);
 for(const profile of ['ci','full','integration','faults','recovery','coverage-risk','api-acceptance','browser-cookie'])
   assert.equal(plan('--profile',profile).tasks.some(x=>x.kind==='account-delete-web'),false,profile);
});

test('original Worker real SQL queue with fake-storage remains strictly opt-in and advisory',()=>{
 const selected=plan('--profile','account-cleanup-worker');
 assert.equal(selected.tasks.length,1);
 const task=selected.tasks[0];
 assert.equal(task.id,'api.account-cleanup.fake-storage-worker');
 assert.equal(task.kind,'account-cleanup-worker');
 assert.equal(task.status,'ready');
 assert.equal(task.reportEnv,'GAFUS_TEST_REPORT_PATH');
 assert.deepEqual(task.command,['bash','scripts/qa/account-cleanup-fake-storage-isolated.sh']);
 assert.deepEqual(task.expectedCases,[
  'transactional_three_scope_enqueue','fake_storage_sweep_and_cdn_checkpoint',
  'queued_cdn_ack_to_sql_done','idempotent_worker_rerun',
  'foreign_user_and_audit_unchanged','redis_isolated_and_sql_queue_fenced']);
 assert.ok(task.resources.includes('fake-in-memory-object-storage'));
 assert.ok(task.resources.includes('durable-SQL-queue'));
 assert.deepEqual(plan('--profile','account-cleanup-worker','--scenario','api.account-cleanup.fake-storage-worker').tasks.map(x=>x.id),[task.id]);
 for(const profile of ['ci','full','unit','integration','recovery','api-acceptance','browser-cookie',
  'account-delete-web','faults','coverage-risk','e2e:web','e2e:mobile'])
  assert.equal(plan('--profile',profile).tasks.some(t=>t.kind==='account-cleanup-worker'),false,profile);
});


test('dirty worktree fingerprint includes changing untracked file contents', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gafus-qa-worktree-'));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    git('init', '-q');
    writeFileSync(join(dir, 'tracked.txt'), 'baseline');
    git('add', 'tracked.txt');
    git('-c', 'user.email=qa@example.test', '-c', 'user.name=QA', 'commit', '-qm', 'baseline');
    const clean = readWorktreeFingerprint(dir);
    assert.equal(clean.changedFiles, 0);
    assert(sameWorktreeFingerprint(clean, readWorktreeFingerprint(dir)));
    writeFileSync(join(dir, 'tracked.txt'), 'changed');
    const changed = readWorktreeFingerprint(dir);
    assert.equal(changed.changedFiles, 1);
    assert(!sameWorktreeFingerprint(clean, changed));
    writeFileSync(join(dir, 'untracked.txt'), 'first');
    const added = readWorktreeFingerprint(dir);
    assert.equal(added.changedFiles, 2);
    writeFileSync(join(dir, 'untracked.txt'), 'second');
    const rewritten = readWorktreeFingerprint(dir);
    assert.equal(rewritten.changedFiles, 2);
    assert(!sameWorktreeFingerprint(added, rewritten), 'dirty state is not captured by status flags alone');
    assert(!sameWorktreeFingerprint(undefined, rewritten), 'legacy plans without source proof fail closed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test('local browser E2E never launches Chromium outside GitHub Actions', () => {
  assert.equal(selectWebE2eExecution({}), false);
  assert.equal(selectWebE2eExecution({ CI: 'true' }), false);
  assert.equal(selectWebE2eExecution({ GITHUB_ACTIONS: 'true' }), false);
  assert.equal(selectWebE2eExecution({ CI: 'true', GITHUB_ACTIONS: 'true' }), true);
  assert.equal(selectWebE2eExecution({ CI: 'true', GITHUB_ACTIONS: 'true', GAFUS_WEB_E2E_AUTOMATED: '0' }), false);
  assert.equal(selectWebE2eExecution({ CI: 'true', GITHUB_ACTIONS: 'true', GAFUS_WEB_E2E_AUTOMATED: '1' }), true);
  for (const env of [
    { GAFUS_WEB_E2E_AUTOMATED: '1' },
    { CI: 'true', GAFUS_WEB_E2E_AUTOMATED: '1' },
    { GITHUB_ACTIONS: 'true', GAFUS_WEB_E2E_AUTOMATED: '1' },
    { CI: 'true', GITHUB_ACTIONS: 'true', GAFUS_WEB_E2E_AUTOMATED: 'maybe' },
  ]) {
    assert.throws(() => selectWebE2eExecution(env), /REFUSE_SEPARATE_CHROMIUM|INVALID_WEB_E2E/);
  }
});


test('browser QA stand uses allocated loopback ports in both Chrome and CI modes', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../../scripts/qa/web-e2e-stand.mjs'), 'utf8');
  assert.match(source, /const apiPort=await allocatePort\(\);/);
  assert.match(source, /webPort=await allocatePort\(\);/);
  assert.match(source, /GAFUS_QA_WEB_PORT:String\(webPort\)/);
  assert.doesNotMatch(source, /automated\?0:(?:3001|5173)/);
});
