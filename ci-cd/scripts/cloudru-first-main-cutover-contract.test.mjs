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
const activation=read('docs/operations/workflow-archive/production-media-activate-reusable.yml');
const release=read('infra/cloudru/production-job-release.mjs');

const parse=(s)=>{const d=YAML.parseDocument(s);assert.equal(d.errors.length,0,d.errors.map(x=>x.message).join('\n'));return d.toJS();};
const byJobs=(s)=>parse(s).jobs;

test('automatic main release syncs Cloud.ru Jobs after app; manual redeploy stays app-only',()=>{
 const ciJobs=byJobs(ci), manualJobs=byJobs(manual);
 const infra=byJobs(read('.github/workflows/infrastructure-jobs.yml'));
 assert(ciJobs['cloudru-jobs-preflight']);
 assert.deepEqual(ciJobs['cloudru-jobs-sync'].needs,['deploy-production']);
 assert.deepEqual(ciJobs['cloudru-jobs-verify'].needs,['cloudru-jobs-sync']);
 assert.deepEqual(ciJobs['beget-verify-after-deploy'].needs,['beget-readonly-preflight','cloudru-jobs-verify']);
 assert.equal(ciJobs['deploy-production'].with.app_only,true);
 assert.equal(manualJobs.deploy.with.app_only,true);
 assert(!manualJobs['cloudru-jobs-sync']);
 assert(infra['apply-existing-jobs']);
 assert(infra['verify-after-apply']);
 assert(!ciJobs['cloudru-media-activate']);
 for(const flow of [ci,manual,jobs,app,activation])
  assert(!flow.includes('GAFUS_REFACTOR_PRODUCTION_CUTOVER'));
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

test('main release preflights existing Cloud.ru Jobs before app and syncs after API health',()=>{
 const graph=byJobs(ci);
 const gate=graph['beget-readonly-preflight'];
 assert(gate.if.includes("github.ref == 'refs/heads/main'"));
 assert(gate.if.includes("github.event_name == 'push'"));
 assert(gate.steps.some(x=>x.run?.includes('beget-release-readiness.mjs --check')));
 assert(gate.steps.some(x=>x.run?.includes('beget-production-smoke.mjs')));
 for(const dep of ['security','build-apps','build-images','cloudru-jobs-preflight'])
  assert(graph['deploy-production'].needs.includes(dep),'MISSING_GATE_'+dep);
 for(const dep of ['security','build-apps','cloudru-media-contracts','beget-readonly-preflight','cutover-preflight'])
  assert(graph['cloudru-jobs-preflight'].needs.includes(dep),'MISSING_PREFLIGHT_'+dep);
 assert(graph['cloudru-jobs-sync'].with.mode==='sync');
 assert(graph['cloudru-jobs-verify'].with.mode==='verify');
 assert(!ci.includes('mode: cutover'),'ONE_TIME_CUTOVER_NOT_IN_AUTOMATIC_CI');
});

test('Vite image matrix sets up Node without requiring pnpm before pnpm install',()=>{
 const graph=byJobs(ci);
 const steps=graph['build-images'].steps;
 const setupIndex=steps.findIndex(x=>x.name==='Setup Node for Vite release assets');
 const pnpmIndex=steps.findIndex(x=>x.name==='Setup pnpm for Vite release assets');
 assert(setupIndex>=0 && pnpmIndex>setupIndex,'VITE_NODE_AND_PNPM_STEPS_REQUIRED');
 assert.equal(steps[setupIndex].with['node-version'],'24');
 assert.equal(steps[setupIndex].with['package-manager-cache'],false,
  'SETUP_NODE_AUTO_CACHE_UNINSTALLED_PNPM');
 const images=graph['build-images'].strategy.matrix.image.map(x=>x.name);
 assert.deepEqual(images.sort(),['admin-panel','api','bull-board','prisma','trainer-panel','web','worker'].sort());
});

test('one coordinated release enables verified Chat2 CDN-first delivery with S3 fallback',()=>{
 const compose=read('ci-cd/docker/docker-compose.prod.yml');
 // Production Hono API must receive the verified public final-media origin.
 // A mere GitHub Environment variable would otherwise be lost by Compose.
 assert(app.includes('echo "CHAT2_V2_CDN_BASE_URL=https://gonomudedoje.begetcdn.cloud"'));
 assert(compose.includes('- CHAT2_V2_CDN_BASE_URL=${CHAT2_V2_CDN_BASE_URL:-}'));
 assert.equal((compose.match(/- CHAT2_V2_CDN_BASE_URL=/g)??[]).length,1);
 assert(app.includes('echo "CHAT2_S3_BUCKET=gafus-chat2-media-2026"'));
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
 assert(release.includes("['--cutover','--sync'].includes(mode)"));
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
