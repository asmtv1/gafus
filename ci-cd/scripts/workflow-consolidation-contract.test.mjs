import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import YAML from 'yaml';

const dir='.github/workflows';
const read=name=>readFileSync(dir+'/'+name+'.yml','utf8');
const parse=name=>YAML.parse(read(name));
const files=readdirSync(dir).filter(x=>x.endsWith('.yml')).sort();

test('primary workflows, independent Beget audit/backup and internal workflows',()=>{
 assert.deepEqual(files,[
  'beget-provider-audit.yml','build-single-container.yml','chat-video-image-release.yml',
  'chat-video-job-rollout.yml',
  'ci-cd.yml','cloudru-media-images.yml',
  'daily-backup.yml','deploy-only.yml','feed-video-job-rollout.yml',
  'feed-worker-image-release.yml','infrastructure-jobs.yml',
  'production-deploy-reusable.yml','production-job-release-reusable.yml'
 ]);
 const primary=['build-single-container','ci-cd','deploy-only','infrastructure-jobs'];
 for(const name of primary) assert(parse(name).on.workflow_dispatch || parse(name).on.push,name);
 for(const name of ['cloudru-media-images','production-deploy-reusable','production-job-release-reusable']){
  assert(parse(name).on.workflow_call,name);
  assert.equal(parse(name).on.workflow_dispatch,undefined,name+' must not expose direct manual launch');
 }
 assert(parse('beget-provider-audit').on.schedule?.length);
 assert(Object.hasOwn(parse('beget-provider-audit').on,'workflow_dispatch'));
 for(const name of ['feed-worker-image-release','feed-video-job-rollout','chat-video-image-release','chat-video-job-rollout']){
  const wf=parse(name);
  assert(wf.on.workflow_dispatch,name+' must require an explicit manual launch');
  assert.equal(wf.on.push,undefined,name+' must not deploy on push');
  assert.equal(wf.jobs[Object.keys(wf.jobs)[0]].environment,'production');
  assert.equal(wf.concurrency['cancel-in-progress'],false);
 }
 assert(parse('daily-backup').on.schedule?.length);
 assert(Object.hasOwn(parse('daily-backup').on,'workflow_dispatch'));
});

test('main CI reconciles Cloud.ru image links while Deploy Only remains app-only',()=>{
 const ci=parse('ci-cd'),retry=parse('deploy-only');
 assert.equal(ci.jobs['deploy-production'].with.app_only,true);
 assert.equal(retry.jobs.deploy.with.app_only,true);
 assert.deepEqual(ci.jobs['cloudru-jobs-sync'].needs,['deploy-production']);
 assert.deepEqual(ci.jobs['cloudru-jobs-verify'].needs,['cloudru-jobs-sync']);
 assert(ci.jobs['deploy-production'].needs.includes('cloudru-jobs-preflight'));
 assert(ci.jobs['deploy-production'].needs.includes('build-images'));
 const bootstrap = "vars.GALLERY_CDN_APP_ONLY_BOOTSTRAP_APPROVED == 'true' && vars.GALLERY_CDN_REDIRECT_RELEASE_APPROVED == 'true'";
 for (const name of ['cloudru-jobs-preflight','cloudru-jobs-sync','cloudru-jobs-verify'])
   assert(ci.jobs[name].if.includes(bootstrap), 'MISSING_GALLERY_JOBS_ISOLATION_'+name);
 assert(ci.jobs['deploy-production'].if.includes('always()'));
 assert(ci.jobs['deploy-production'].if.includes("needs.build-images.result == 'success'"));
 assert(ci.jobs['deploy-production'].if.includes(bootstrap));
 assert(ci.jobs['beget-verify-after-deploy'].if.includes("needs.deploy-production.result == 'success'"));
 assert(ci.jobs['beget-verify-after-deploy'].if.includes(bootstrap));
 assert(ci.jobs['beget-verify-after-deploy'].needs.includes('deploy-production'));

 assert(!Object.keys(retry.jobs).some(x=>x.includes('cloudru-jobs')));
 assert(retry.jobs.deploy.needs.includes('preflight-cdn'));
 assert(retry.jobs['validate-release'].steps.some(x=>x.run?.includes('RELEASE_IMAGES_OR_QA_NOT_VERIFIED')));
 assert(retry.jobs['validate-release'].steps.some(x=>x.run?.includes('SCHEMA_COMPATIBLE')));
 assert.equal(retry.concurrency['cancel-in-progress'],false);
});

test('Beget control-plane outage cannot block an ordinary source release',()=>{
 const ci=parse('ci-cd'), manual=parse('deploy-only'), audit=parse('beget-provider-audit');
 const detector=ci.jobs['beget-provider-change-detect'];
 assert.equal(detector.steps[0].with['fetch-depth'],0);
 assert(detector.steps.some(s=>s.run?.includes('beget-provider-change-detect.mjs')));
 const preflight=ci.jobs['beget-readonly-preflight'];
 assert(preflight.needs.includes('beget-provider-change-detect'));
 const providerStep=preflight.steps.find(s=>s.run?.includes('node infra/cloudru/gallery-redirect-release-gate.mjs'));
 assert(providerStep);
 assert.equal(providerStep.if,"needs.beget-provider-change-detect.outputs.provider_required == 'true'");
 assert(preflight.steps.some(s=>s.run?.includes('checkGalleryRedirectConfig(process.env)')));
 const liveFeed = preflight.steps.find(s=>s.run?.includes('beget-production-smoke.mjs'));
 assert(liveFeed);
 assert.equal(liveFeed.if,"needs.beget-provider-change-detect.outputs.provider_required == 'true'");
 assert(liveFeed.run.includes('beget-gallery-redirect-canary.mjs'));
 assert(ci.jobs['deploy-production'].if.includes("needs.beget-readonly-preflight.result == 'success'"));
 assert(manual.jobs['preflight-cdn'].steps.some(s=>s.run?.includes('checkGalleryRedirectConfig(process.env)')));
 assert(!manual.jobs['preflight-cdn'].steps.some(s=>s.run?.includes('node infra/cloudru/gallery-redirect-release-gate.mjs')));
 assert(!manual.jobs['preflight-cdn'].steps.some(s=>s.run?.includes('beget-gallery-redirect-canary.mjs')));
 assert(!manual.jobs['preflight-cdn'].steps.some(s=>s.run?.includes('beget-production-smoke.mjs')));
 assert(!manual.jobs['verify-cdn']);
 const shared=parse('production-deploy-reusable').jobs['deploy-production'];
 assert(shared.steps.some(s=>s.run?.includes('checkGalleryRedirectConfig(process.env)')));
 const providerAccess=shared.steps.filter(s=>s.run?.includes('node infra/cloudru/gallery-redirect-release-gate.mjs')||s.run?.includes('node infra/cloudru/beget-production-smoke.mjs'));
 assert(providerAccess.length>=2);
 for(const step of providerAccess) {
  // Feed cache must also be verified for app-only releases after the public
  // 24h-cache flag is enabled; this one read-only canary is intentional.
  if (step.name === 'Verify actual Feed 24h CDN browser response before SSH') {
    assert(step.run.includes('--feed-only'));
    assert(step.if.includes("vars.FEED_PUBLIC_BROWSER_CACHE_24H_VERIFIED == 'true'"));
  } else {
    assert(step.if?.includes('!inputs.app_only'), 'APP_ONLY_SHARED_PROVIDER_API_BLOCKER_'+step.name);
  }
 }
 const after=ci.jobs['beget-verify-after-deploy'];
 assert(after.if.includes("needs.beget-provider-change-detect.outputs.provider_required == 'true'"));
 assert(after.needs.includes('beget-provider-change-detect'));
 const auditSteps=audit.jobs['provider-audit'].steps;
 assert(auditSteps.some(s=>s.run?.includes('node infra/cloudru/gallery-redirect-release-gate.mjs')));
 assert(auditSteps.some(s=>s.run?.includes('beget-production-smoke.mjs') && s.if==='always()'));
 assert(auditSteps.some(s=>s.run?.includes('beget-gallery-redirect-canary.mjs') && s.if==='always()'));
 assert.equal(audit.jobs['provider-audit'].environment,'production');
 assert.notEqual(audit.concurrency.group,'gafus-production-deploy');
 assert(!('push' in audit.on));
});

test('single build has immutable digest and only touches the selected service',()=>{
 const yaml=parse('build-single-container');
 assert.deepEqual(yaml.on.workflow_dispatch.inputs.container.options,
   ['web','trainer-panel','admin-panel','api','worker','bull-board','prisma']);
 const build=yaml.jobs.build.steps.find(x=>x.uses==='docker/build-push-action@v6');
 assert(build);
 assert(build.with.tags.includes('manual-'));
 assert(!build.with.tags.includes(':latest'));
 const deploy=yaml.jobs.deploy;
 assert(deploy.concurrency.group==='gafus-production-deploy');
 assert(deploy.steps[0].with.script.includes('docker pull "$image@$digest"'));
 assert(deploy.steps[0].with.script.includes('PRODUCTION_SHA_DIFFERS'));
 assert(deploy.steps[0].with.script.includes('trap restore ERR'));
 assert(deploy.steps[0].with.script.includes('--no-deps --force-recreate "$service"'));
 assert(!deploy.steps[0].with.script.includes('docker volume rm'));
 const shell=spawnSync('bash',['-n'],{input:deploy.steps[0].with.script,encoding:'utf8'});
 assert.equal(shell.status,0,shell.stderr);
});

test('Cloud.ru updates require explicit confirmation and cannot delete S3/Jobs',()=>{
 const infra=parse('infrastructure-jobs');
 assert.deepEqual(infra.on.workflow_dispatch.inputs.operation.options,
  ['plan','preflight','apply-existing-jobs','verify','publish-media-images','beget-readonly-diagnostic',
   'beget-gallery-create','beget-gallery-configure','beget-gallery-canary']);
 assert(infra.jobs.guard.steps[0].run.includes('UPDATE_4_ACTIVE_VIDEO_JOBS'));
 assert(infra.jobs['publish-guard'].steps[0].run.includes('PUBLISH_MEDIA_IMAGES'));
 assert.equal(infra.jobs['apply-existing-jobs'].needs,'preflight');
 assert.equal(infra.jobs['publish-media-images'].needs,'publish-guard');
 // The temporary Beget CDN setup operations are production-secret scoped but
 // cannot be run from main or any arbitrary branch. Mutating operations also
 // require an exact confirmation inside their own scripts.
 for(const action of ['beget-gallery-create',
   'beget-gallery-configure','beget-gallery-canary']) {
  assert(infra.jobs[action].if.includes("refs/heads/chore/gallery-cdn-307-migration"),action);
  assert.equal(infra.jobs[action].environment,'production',action);
 }
 assert(infra.jobs['beget-gallery-create'].env.GALLERY_CDN_CREATE_CONFIRM.includes('inputs.confirmation'));
 assert(infra.jobs['beget-gallery-configure'].env.GALLERY_CDN_CONFIGURE_CONFIRM.includes('inputs.confirmation'));
 const create=readFileSync('infra/cloudru/beget-gallery-create.mjs','utf8');
 const configure=readFileSync('infra/cloudru/beget-gallery-secure-configure.mjs','utf8');
 assert(create.includes('CREATE_ISOLATED_GALLERY_CDN_2026_11_01'));
 assert(configure.includes('SECURE_NEW_GALLERY_CDN_2026_11_01'));
 assert(!/method:\s*['"]DELETE['"]/.test(create+configure));
 const source=read('infrastructure-jobs');
 assert(!/aws s3 rm|mc rm|rclone delete|s3.deleteObject/i.test(source));
});

test('backup is append-only, verifies uploaded file and never deletes old backups',()=>{
 const yaml=parse('daily-backup');
 assert(yaml.on.schedule);
 const source=readFileSync('ci-cd/scripts/backup-to-yandex.sh','utf8');
 assert(source.includes('overwrite=false'));
 assert(source.includes('BACKUP_VERIFIED_REMOTE'));
 assert(source.includes('YANDEX_BACKUP_SIZE_MISMATCH'));
 assert(source.includes('set -euo pipefail'));
 assert(!/curl\s+-X\s+DELETE|--request\s+DELETE/.test(source));
 assert(!/^\s*[^#\n]*overwrite=true/m.test(source));
 assert(!/docker\s+(stop|rm)|docker-compose.*down/.test(source));
 const bash=spawnSync('bash',['-n','ci-cd/scripts/backup-to-yandex.sh'],{encoding:'utf8'});
 assert.equal(bash.status,0,bash.stderr);
});


test('pnpm store cache integrity is never disabled in any CI job', () => {
 const ci=read('ci-cd');
 assert(!ci.includes('verify-store-integrity false'), 'A corrupted dependency cache must not bypass pnpm verification');
 const count = (ci.match(/pnpm config set verify-store-integrity true/g) ?? []).length;
 assert.equal(count, 3, 'Every restored pnpm store in the 3 build stages requires integrity checking');
 for (const workflow of files) {
  assert(!read(workflow.replace(/\.yml$/, '')).includes('verify-store-integrity false'), workflow);
 }
});


test('parallel package builds wait on each child PID and fail the release on any error', () => {
 const ci=read('ci-cd');
 assert(!/^\s+wait\s*$/m.test(ci), 'A bare wait loses individual child exit codes');
 for (const name of ['queues_pid', 'cdn_pid', 'video_pid']) {
  assert(ci.includes(`wait "$${name}" || parallel_failed=1`), `Unobserved ${name} failure`);
 }
 assert(ci.includes("REQUIRED_PARALLEL_PACKAGE_BUILD_FAILED"));
});


test('dependency validation is blocking (cannot echo and continue)', () => {
 const ci=read('ci-cd');
 assert(ci.includes('pnpm list --depth=0 --json > /dev/null'));
 assert(!ci.includes('Dependency validation failed, but continuing'));
});


test('core-client is built before Core to prevent cached CDN transport drift', () => {
 const ci=read('ci-cd');
 const dependency=ci.indexOf('cd packages/core-client && pnpm build');
 const dependent=ci.indexOf('cd packages/core && pnpm build');
 assert(dependency > 0 && dependent > dependency, 'Core cannot load a stale core-client/dist');
 assert(ci.includes('--filter=!@gafus/core-client'), 'Do not rebuild Core dependency out of order');
});
