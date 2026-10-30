import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import YAML from 'yaml';

const read=(p)=>readFileSync(p,'utf8');
const ci=read('.github/workflows/ci-cd.yml');
const manual=read('.github/workflows/deploy-only.yml');
const jobs=read('.github/workflows/production-job-release-reusable.yml');
const app=read('.github/workflows/production-deploy-reusable.yml');
const activation=read('.github/workflows/production-media-activate-reusable.yml');
const release=read('infra/cloudru/production-job-release.mjs');

const parse=(s)=>{const d=YAML.parseDocument(s);assert.equal(d.errors.length,0,d.errors.map(x=>x.message).join('\n'));return d.toJS();};
const byJobs=(s)=>parse(s).jobs;

test('first main push always stages new API, switches existing Cloud Jobs, then activates and verifies V2',()=>{
 const graph=byJobs(ci);
 const required=['cloudru-jobs-preflight','deploy-production','cloudru-jobs-cutover','cloudru-media-activate','cloudru-jobs-verify'];
 for(const name of required)assert(graph[name],'MISSING_'+name);
 assert.deepEqual(graph['cloudru-jobs-cutover'].needs,['deploy-production']);
 assert.deepEqual(graph['cloudru-media-activate'].needs,['cloudru-jobs-cutover']);
 assert.deepEqual(graph['cloudru-jobs-verify'].needs,['cloudru-media-activate']);
 assert.deepEqual(graph['beget-verify-after-deploy'].needs,['beget-readonly-preflight','cloudru-jobs-verify']);
 const m=byJobs(manual);
 assert.deepEqual(m['cloudru-jobs-cutover'].needs,['validate-release','deploy']);
 assert.deepEqual(m['cloudru-media-activate'].needs,['validate-release','cloudru-jobs-cutover']);
 assert.deepEqual(m['cloudru-jobs-verify'].needs,['validate-release','cloudru-media-activate']);
 for(const flow of [ci,manual,jobs,app,activation])
  assert(!flow.includes('GAFUS_REFACTOR_PRODUCTION_CUTOVER'),'LEGACY_MAIN_GATE_MUST_NOT_SKIP_V2');
});

test('cutover preflight can run Node 24 without installing pnpm; release gates remain blocking',()=>{
 const graph=byJobs(ci);
 const steps=graph['cutover-preflight'].steps;
 const setup=steps.find(x=>x.uses==='actions/setup-node@v5');
 assert(setup,'CUTOVER_MISSING_NODE_SETUP');
 assert.equal(setup.with['node-version'],'24');
 assert.equal(setup.with['package-manager-cache'],false,
  'CUTOVER_SETUP_NODE_MUST_NOT_AUTO_CACHE_UNINSTALLED_PNPM');
 const readiness=steps.find(x=>x.name==='Fail closed unless Chat2 and functional QA are release-ready');
 assert.match(readiness?.run ?? '',/check-chat2-prod-boundary\.mjs --candidate/);
 assert.match(readiness?.env?.CHAT2_API_ENABLED ?? '',/vars\.CHAT2_API_ENABLED/);
 const beget=graph['beget-readonly-preflight'].steps;
 assert(beget.some(x=>x.run?.includes('beget-release-readiness.mjs --check')),
  'BEGET_PRODUCTION_APPROVAL_GATE_MUST_NOT_BE_SKIPPED');
});

test('no Cloud.ru Docker build, push, phantom Job, old Gallery image or CDN/S3 mutation in release workflows',()=>{
 for(const flow of [ci,manual,jobs,activation]){
  assert.doesNotMatch(flow,/cloudru-build-media-images:|publish-cloudru-image\.sh|docker\/build-push-action@v6.*gafus\.cr\.cloud\.ru/);
  assert.doesNotMatch(flow,/gafus-questions-photo-2|gafus-gallery-process-staging|gafus-feed-photo-staging/);
 }
 const plan=spawnSync(process.execPath,['infra/cloudru/production-job-release.mjs','--plan'],{encoding:'utf8'});
 assert.equal(plan.status,0,plan.stderr);
 const obj=JSON.parse(plan.stdout);
 assert.equal(obj.targets.length,11);
 assert.equal(obj.mutates,false);
 assert.equal(obj.buildsImages,false);
 assert.equal(obj.provisionsJobs,false);
 assert.equal(obj.targets.filter(t=>t.targetImage.includes('7f8d4325')).length,2);
 assert(!obj.targets.some(t=>t.targetImage.includes('652b3ce4')),'OLD_GALLERY_NOT_ALLOWED_AS_TARGET');
 assert(obj.targets.filter(t=>t.targetImage==='KEEP_EXISTING_PINNED_CHAT2_IMAGE').length===4);
});

test('no worker dispatch until Cloud.ru new-image cutover; activation has failure rollback',()=>{
 assert(app.includes('echo "CLOUDRU_MEDIA_JOBS_ENABLED=false"'));
 assert(app.includes('echo "QUESTIONS_V2_MEDIA_ENABLED=false"'));
 assert(app.includes('echo "CHAT2_V2_MEDIA_ENABLED=false"'));
 assert(activation.includes("'CLOUDRU_MEDIA_JOBS_ENABLED':'true'"));
 assert(activation.includes("'GALLERY_PROCESSOR_SECOND_READY':'true'"));
 assert(activation.includes("'FEED_CLOUDRU_REFRACTOR_VERIFIED':'true'"));
 assert(activation.includes("'QUESTIONS_V2_MEDIA_ENABLED':'true'"));
 assert(activation.includes("'CHAT2_V2_MEDIA_ENABLED':'true'"));
 assert(activation.includes('trap rollback_activation EXIT'));
 assert(activation.includes('MEDIA_DISPATCH_RESTORED_TO_DISABLED'));
 const extracted=byJobs(activation).activate.steps[0].with.script;
 const bash=spawnSync('bash',['-n'],{input:extracted,encoding:'utf8'});
 assert.equal(bash.status,0,bash.stderr);
});

test('Cloud.ru release is hard-gated to main, exact SHA and deployed API, verifies V2 routes',()=>{
 assert(release.includes('NEW_BACKEND_MUST_BE_DEPLOYED_BEFORE_JOBS'));
 assert(release.includes("e.GITHUB_REF!=='refs/heads/main'"));
 assert(release.includes('e.RELEASE_SHA!==e.GITHUB_SHA'));
 assert(release.includes("mode==='--cutover'"));
 assert(release.includes('CLOUDRU_NEW_JOB_NOT_ACTIVATED'));
 assert(release.includes('V2_BACKEND_NOT_ACTIVATED'));
 assert(jobs.includes('docker buildx imagetools inspect'));
 for(const mode of ['--cutover','--verify','--preflight']){
  const r=spawnSync(process.execPath,['infra/cloudru/production-job-release.mjs',mode],{
    encoding:'utf8',env:{...process.env,GITHUB_REF:'refs/heads/develop',GITHUB_EVENT_NAME:'push'},timeout:6000});
  assert.notEqual(r.status,0,mode);
  assert.match(r.stderr,/PROD_CLOUDRU_JOB_RELEASE_GUARD/);
 }
});
