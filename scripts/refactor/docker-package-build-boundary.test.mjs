import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {parse}=require('yaml');
const root=new URL('../../',import.meta.url);
const read=(file)=>readFileSync(new URL(file,root),'utf8');
const workflows=['.github/workflows/ci-cd.yml','.github/workflows/build-single-container.yml','docs/operations/workflow-archive/refactor-vite-release.yml'];
const recipes={
  'ci-cd/docker/Dockerfile-api-optimized':'@gafus/api...',
  'ci-cd/docker/Dockerfile-worker-optimized':'@gafus/worker...',
  'ci-cd/docker/Dockerfile-api-optimized-qa-low-concurrency':'@gafus/api...',
  'ci-cd/docker/Dockerfile-api':'@gafus/api...',
  'ci-cd/docker/Dockerfile-prisma-optimized':'@gafus/prisma',
  'ci-cd/docker/Dockerfile-bull-board-optimized':'@gafus/bull-board...',
};
function assertProperRecipe(file,filter){
  const src=read(file);
  assert.match(src,new RegExp(`RUN pnpm exec turbo run build --filter='${filter.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}'`));
  assert.doesNotMatch(src,/\bpnpm (?:run )?build\s+--filter/,`never invoke root gated scripts inside partial Docker context (${file})`);
  if(filter.includes('api...')||filter.includes('worker...')){
    assert.match(src,/RUN pnpm exec turbo run build --filter=/);
    if(file!=='ci-cd/docker/Dockerfile-api'){
      assert.match(src,/COPY ci-cd\/docker\/check-runtime-package-exports\.mjs \/app\/check-runtime-package-exports\.mjs/);
      assert.match(src,new RegExp(`RUN node /app/check-runtime-package-exports\\.mjs (?:api|worker)`));
      const [command]=src.match(/RUN pnpm exec turbo run build[^\n]*/)||[];
      assert.ok(command && command.includes('--filter='));
    }
  }
}
test('every production and QA Dockerfile avoids unsafe root pnpm build --filter, keeps graph',()=>{
  for(const [file,filter] of Object.entries(recipes))assertProperRecipe(file,filter);
  assert.match(read('ci-cd/docker/Dockerfile-api-optimized-qa-low-concurrency'),/--concurrency=2/);
});
test('independent CI entrypoints enforce boundary before first workspace build, without skipping/errors',()=>{
  for(const file of workflows){
    const yaml=parse(read(file));
    const job=file.endsWith('refactor-vite-release.yml')?'verify':file.endsWith('build-single-container.yml')?'build':'prepare-deps';
    const steps=yaml.jobs[job].steps;
    const installs=steps.map((step,i)=>/pnpm install --frozen-lockfile/.test(step.run||'')?i:-1).filter(i=>i>=0);
    assert.ok(installs.length,'locked install required before gate');
    const gate=steps.findIndex(step=>step.run==='pnpm check:core-boundaries');
    assert.ok(gate>Math.max(...installs),`${file}: gate after install`);
    const firstBuild=steps.findIndex(step=>/Build packages|Build all Vite workspace dependencies|Build Types and execute public API regression tests/.test(step.name||''));
    assert.ok(firstBuild>gate,`${file}: gate before first build`);
    assert.equal(steps[gate].if,undefined);
    assert.equal(steps[gate]['continue-on-error'],undefined);
    assert.equal(yaml.jobs[job]['continue-on-error'],undefined);
  }
  const main=parse(read(workflows[0]));
  const builds=main.jobs['build-apps'].steps;
  const bound=builds.findIndex(x=>x.run==='pnpm check:core-boundaries');
  assert.ok(bound>0 && bound<builds.findIndex(x=>x.name==='Build, test, typecheck apps'));
});
test('CI bare pnpm build --filter cannot bypass the mandatory job gate',()=>{
  for(const file of workflows){
    const src=read(file);
    assert.doesNotMatch(src,/\bpnpm build --filter(=|\s)/);
  }
});
test('runtime image validation keeps 9/48 active baseline and separately verifies API 38/234, Worker 37/224 runtime graphs',()=>{
  const verify=read('ci-cd/docker/check-runtime-package-exports.mjs');
  for(const name of ['core-client','achievements','consent','mobile-intro','notifications','feature-flags','admin-rewarded-ads','tracking','admin-reengagement','subscription-read-server'])
    assert.match(verify,new RegExp(name));
  assert.match(verify,/legacyPackages\.length !== 9 \|\| legacyExportsChecked !== 48/);
  assert.match(verify,/exportsChecked !== 224/);
  assert.match(verify,/exportsChecked !== 234/);
  assert.match(verify,/if \(legacyPackages\.includes\(name\)\) legacyExportsChecked\+\+/);
  const required = ['core-client','achievements-server','consent-server','mobile-intro-server','notifications-server','feature-flags-server','admin-rewarded-ads-server','tracking-server','admin-reengagement-server','subscription-read-server','subscription-write-server','statistics','logger','feed-server','questions-server','consultation-server','exam-server','gallery-server','course-server','pets-server','media-server','article-server','gafus-server','entitlements-server','course-read-server','trainer-ai-server','course-progress-server','identity-write-server','consultation-query-server','subscription-finance-server','subscription-trial-server','questions-write-server','consultation-write-server','subscription-payment-server'];
  const latestExportCount = required.reduce((sum, pkg) =>
    sum + Object.keys(JSON.parse(read(`packages/${pkg}/package.json`)).exports).length, 0);
  const legacyExportCount = required.slice(0,9).reduce((sum,pkg)=>
    sum + Object.keys(JSON.parse(read(`packages/${pkg}/package.json`)).exports)
      .filter(key => !(pkg === "core-client" && key === "./chat2/realtime-subscription") &&
        !(pkg === "core-client" && key === "./chat2/send-attempt") &&
        !(pkg === "notifications-server" && key === "./chat-outbox-diagnostics") &&
        !(pkg === "notifications-server" && key === "./training-reminder-application") &&
        !(pkg === "tracking-server" && key === "./walks") &&
        !(pkg === "notifications-server" && key === "./trainingReminderClaims") &&
        !(pkg === "notifications-server" && key === "./adminBroadcastService") &&
        !(pkg === "notifications-server" && key === "./push-subscriptions") &&
        !(pkg === "notifications-server" && key === "./gafus-delivery") &&
        !(pkg === "notifications-server" && key === "./training-reminder-delivery") &&
        !(pkg === "notifications-server" && key === "./consultation-email-outbox") &&
        !(pkg === "notifications-server" && key === "./reminder-expiry-redaction") &&
        !(pkg === "notifications-server" && key === "./training-reminder-storage")).length,0);
  assert.equal(legacyExportCount,48,'active API baseline exports must not regress');
  assert.equal(latestExportCount,219,'all combined 219 compiled runtime entrypoints must remain required');
  assert.match(verify,/RUNTIME_TRAINING_REMINDER_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_TRAINING_REMINDER_DELIVERY_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_ADMIN_BROADCAST_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_PUSH_SUBSCRIPTIONS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_GAFUS_DELIVERY_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_GAFUS_REACTION_PROGRESS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_SMART_FEED_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_PLATFORM_STATS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_STAFF_SEARCH_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_QUESTION_NOTIFICATIONS_EXPORT_MISSING/);
  assert.doesNotMatch(read('packages/worker/package.json'),/"@gafus\/chat-server"/);
  assert.doesNotMatch(read('ci-cd/docker/Dockerfile-worker-optimized'),/import\('@gafus\/chat-server'\)/);
  assert.match(verify,/RUNTIME_RETIRED_FEED_PHOTO_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_TRAINER_EDITOR_COUNTS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_TRAINER_VIDEO_PLAYBACK_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_FEED_RUNTIME_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_FEED_BACKGROUND_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_CONSULTATION_ADMIN_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_CONSULTATION_READBACK_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_CONSULTATION_VOX_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_EXAM_CLEANUP_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_GALLERY_RUNTIME_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_GALLERY_RECOVERY_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_QUESTIONS_PHOTOS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_COURSE_PUBLIC_CATALOG_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_COURSE_PERSONALIZATION_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_COURSE_REVIEWS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_COURSE_FAVORITES_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_COURSE_MINI_GUIDES_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_COURSE_CACHE_REVISION_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_ONLINE_STEP_BINDING_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_CONSULTATION_MAIL_DELIVERY_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_PETS_WEIGHT_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_DOG_WALKS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_MEDIA_PURGE_REPOSITORY_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_TRAINER_TRANSCODING_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_VIDEO_PROGRESS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_ARTICLE_LIKES_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_GAFUS_ACTIVITY_READ_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_GAFUS_SETTINGS_READ_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_POLICY_READS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_QUESTION_PHOTO_TASK_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_PET_READ_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_COURSE_PATH_READ_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_TRAINER_AI_PERSISTENCE_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_COURSE_CONTENT_REVISION_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_GAFUS_WALLET_LOCK_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_COURSE_PROGRESS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_PASSWORD_RESET_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_CONSULTATION_ELIGIBILITY_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_PAYMENT_FINANCE_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_COURSE_EDITOR_SNAPSHOT_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_SUBSCRIPTION_TRIAL_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_CONSULTATION_EMAIL_OUTBOX_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_DELETED_MEDIA_PURGE_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_QUESTION_V2_CLEANUP_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_NPD_OPERATION_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_VET_VISIT_DETAIL_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_GAFUS_ENTITLEMENT_READS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_REMINDER_EXPIRY_REDACTION_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_COURSE_DELETE_VERSIONED_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_REWARDED_SETTINGS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_COURSE_VERSION_ROWS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_VIDEO_ACCESS_READ_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_TRAINING_REMINDER_STORAGE_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_GAFUS_WALLET_RECORDS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_DIARY_ENTRIES_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_LEGACY_IMPORT_RECORDS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_PREVENTION_REMINDER_ROWS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_NPD_RECEIPTS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_PROFIT_RECONCILIATION_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_REGISTRATION_CONTEXT_READS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_GAFUS_UNLOCK_RECORDS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_ACCOUNT_CLEANUP_RECORDS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_ACCOUNT_CLEANUP_WORKER_ROWS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_CYNOLOGIST_CATALOG_ROWS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_CONSULTATION_SCHEDULE_ROWS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_REGISTRATION_CONTRACT_ROWS_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_PET_MEDIA_OUTBOX_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_PET_MEDIA_SQL_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_PET_MEDIA_DEFAULT_DB_EXPORT_MISSING/);
  assert.match(verify,/RUNTIME_VET_VISIT_WRITE_ROWS_EXPORT_MISSING/);
  assert.ok(latestExportCount>legacyExportCount,'extracted subscription-read package must contribute compiled exports');
  assert.match(verify,/assertFile\(jsPath/);
  assert.match(verify,/assertFile\(resolve\(moduleDir, types\)/);
  assert.match(verify,/createRequire\(realpathSync\('\/app\/node_modules\/@gafus\/core\/package.json'\)\)/);
  assert.doesNotMatch(verify,/await import\(specifier\)|require\(specifier\)/);
  for(const file of ['ci-cd/docker/Dockerfile-api-optimized.dockerignore','ci-cd/docker/Dockerfile-api-optimized-qa-low-concurrency.dockerignore','ci-cd/docker/Dockerfile-worker-optimized.dockerignore']){
    const source=read(file);
    assert.match(source,/^\*\*$/m);
    assert.match(source,/!ci-cd\/docker\/check-runtime-package-exports\.mjs/);
    assert.match(source,/\*\*\/\.env/m);
    assert.match(source,/\*\*\/node_modules/);
    assert.match(source,/\*\*\/\*\.test\.\*/);
    assert.match(source,/\*\*\/tests\/\*\*/);
    assert.doesNotMatch(source,/!scripts\/\*\*/);
  }
  assert.doesNotMatch(read('.dockerignore'),/!apps\/web-vite\/dist/, 'root .dockerignore must be unchanged by this packet');
});
// Verify fixture mutation would be rejected; gate must be unconditional.
test('negative fixtures: missing and non-blocking boundary step are rejected',()=>{
  const yaml=parse(read(workflows[0]));
  const steps=yaml.jobs['prepare-deps'].steps;
  const index=steps.findIndex(x=>x.run==='pnpm check:core-boundaries');
  assert.ok(index>0);
  const valid=(list)=>{const i=list.findIndex(x=>x.run==='pnpm check:core-boundaries');return i>0 && !list[i].if && !list[i]['continue-on-error'] && i<list.findIndex(x=>x.name==='Build packages');};
  assert.equal(valid(steps),true);
  assert.equal(valid([...steps.slice(0,index),...steps.slice(index+1)]),false);
  const variant=(p)=>steps.map((s,i)=>i===index?{...s,...p}:s);
  assert.equal(valid(variant({if:'github.ref == "refs/heads/main"'})),false);
  assert.equal(valid(variant({'continue-on-error':true})),false);
});

test('API and Worker deployment keeps Sharp platform binaries from optional dependencies',()=>{
  for(const file of [
    'ci-cd/docker/Dockerfile-api-optimized',
    'ci-cd/docker/Dockerfile-api-optimized-qa-low-concurrency',
    'ci-cd/docker/Dockerfile-worker-optimized',
  ]) {
    const source=read(file);
    assert.match(source,/pnpm deploy[^\n]*--prod \/app\/deploy/);
    assert.doesNotMatch(source,/pnpm deploy[^\n]*--no-optional/,
      `${file}: Sharp requires its platform-specific optional packages`);
  }
});
