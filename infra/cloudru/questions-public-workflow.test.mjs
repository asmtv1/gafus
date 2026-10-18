import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const parse = file => require('yaml').parse(readFileSync(file, 'utf8'));
const ci = parse('.github/workflows/ci-cd.yml');
const deploy = parse('.github/workflows/production-deploy-reusable.yml');
const compose = readFileSync('ci-cd/docker/docker-compose.prod.yml', 'utf8');
const target = {
  QUESTIONS_PUBLIC_S3_BUCKET: 'gafus-questions-public',
  QUESTIONS_CDN_BASE_URL: 'https://ebiteskukingusk.begetcdn.cloud',
  QUESTIONS_BEGET_CDN_SERVICE_ID: '3c2a1623-50a1-46a1-b7a4-bb1093eaedf0',
};
const runtimeFlag = "${{ vars.QUESTIONS_PUBLIC_S3_ENABLED || 'true' }}";
const liveFlag = "${{ vars.QUESTIONS_CDN_LIVE_VERIFIED || 'true' }}";
const jobFlag = "${{ vars.QUESTIONS_CLOUD_JOB_ENABLED || 'true' }}";
const readyFlag = "${{ vars.QUESTIONS_PROCESSOR_READY || 'true' }}";

test('Questions job is a separately published gated Cloud.ru container image', () => {
  const cloudJob = ci.jobs['cloudru-build-media-images'];
  assert.ok(cloudJob.strategy.matrix.include.some(item =>
    item.media === 'questions' && item.role === 'worker' && item.dockerfile === 'Dockerfile'));
  const release=ci.jobs['cloudru-prepare-media'];
  assert.equal(release.env.QUESTIONS_CLOUD_JOB_ENABLED,
    "${{ vars.QUESTIONS_CLOUD_JOB_ENABLED || 'true' }}");
  assert.ok(release.needs.includes('cloudru-build-media-images'));
  assert.match(release.steps.find(s=>s.name?.includes('Provision and warm Cloud.ru'))?.run ?? '',
    /production-media-release\.mjs --prepare/);
  const runtime=deploy.jobs['deploy-production'].steps
    .find(s=>s.name==='Deploy to production server');
  const scripts=Object.entries(runtime.env).filter(([key])=>key.startsWith('DEPLOY_SCRIPT_'))
    .map(([,val])=>val).join('\n');
  assert.ok(scripts.includes("QUESTIONS_PROCESSOR_READY=${{ vars.QUESTIONS_PROCESSOR_READY || 'true' }}"));
});
test('single push verifies existing production Cloud.ru Questions job before any image publish', () => {
  const job=ci.jobs['beget-readonly-preflight'];
  const step=job.steps.find(s=>s.name?.includes('Verify existing Questions Cloud.ru production Job'));
  assert.equal(step?.run,'node infra/cloudru/questions-job-live-readiness.mjs');
  assert.ok(step.env.CLOUDRU_KEY_ID.includes('secrets.CLOUDRU_KEY_ID'));
  assert.ok(step.env.CLOUDRU_KEY_SECRET.includes('secrets.CLOUDRU_KEY_SECRET'));
  assert.equal(step.env.QUESTIONS_PUBLIC_S3_ENABLED,runtimeFlag);
  assert.equal(step.env.QUESTIONS_CLOUD_JOB_ENABLED,jobFlag);
  assert.equal(step.env.QUESTIONS_PROCESSOR_READY,readyFlag);
  const manual=deploy.jobs['deploy-production'].steps;
  const deployGate=manual.findIndex(s=>s.name?.includes('Verify existing Questions Cloud.ru production Job'));
  const ssh=manual.findIndex(s=>s.name==='Deploy to production server');
  assert.ok(deployGate>=0 && deployGate<ssh);
  assert.equal(manual[deployGate].run,step.run);
  const prep=ci.jobs['cloudru-prepare-media'];
  assert.ok(prep.needs.includes('cloudru-build-media-images'));
  assert.match(prep.steps.map(s=>s.run??'').join('\n'),/production-media-release\.mjs --verify/);
  const smoke=prep.steps.findIndex(s=>s.name?.includes('synthetic WebP smoke'));
  const verify=prep.steps.findIndex(s=>s.name?.includes('Wait for Cloud.ru Jobs revision'));
  assert.ok(smoke>verify && verify>=0);
  assert.equal(prep.steps[smoke].if,"env.QUESTIONS_PUBLIC_S3_ENABLED == 'true'");
  assert.equal(prep.steps[smoke].run,"node infra/cloudru/questions-production-job-smoke.mjs");
  assert.equal(prep.env.QUESTIONS_PUBLIC_S3_ENABLED,runtimeFlag);
  assert.ok(ci.jobs['deploy-production'].needs.includes('cloudru-prepare-media'));
});
test('Next.js build completes before TypeScript reads generated .next/types', () => {
  const step = ci.jobs['build-apps'].steps.find(s => s.name === 'Build, test, typecheck apps');
  assert.ok(step);
  const stage = step.run;
  const order = ['pnpm turbo run build', 'pnpm turbo run typecheck', 'pnpm turbo run test'];
  const offsets = order.map(item => stage.indexOf(item));
  assert.ok(offsets[0] >= 0 && offsets[1] > offsets[0] && offsets[2] > offsets[1]);
  assert.ok(!stage.includes('pnpm turbo run build test typecheck'));
  assert.match(stage, /filters=\(--filter='\.\/apps\/web'/);
});

test('push preflight checks Questions before image publication and production deployment', () => {
  const job = ci.jobs['beget-readonly-preflight'];
  assert.deepEqual(job.needs, ['security', 'build-apps', 'cloudru-media-contracts']);
  const steps = job.steps.map(x => x.name);
  assert.ok(steps.includes('Verify Questions CDN working HTTPS and exact public S3 origin (read-only)'));
  assert.equal(ci.jobs['cloudru-build-media-images'].needs.includes('beget-readonly-preflight'), true);
  for (const [key, value] of Object.entries(target)) assert.equal(job.env[key], value);
  assert.equal(job.env.QUESTIONS_PUBLIC_S3_ENABLED, runtimeFlag);
  assert.equal(job.env.QUESTIONS_CLOUD_JOB_ENABLED, jobFlag);
  assert.equal(job.env.QUESTIONS_PROCESSOR_READY, readyFlag);
  assert.equal(job.env.QUESTIONS_CDN_LIVE_VERIFIED, liveFlag);
  assert.ok(job.env.BEGET_CDN_API_TOKEN.includes('secrets.BEGET_CDN_API_TOKEN'));
  assert.match(ci.jobs['build-apps'].steps.map(s => s.name ?? '').join(','),
    /Questions isolated S3, legacy safety and CDN purge tests/);
  const tests=ci.jobs['build-apps'].steps.find(s=>s.name?.includes('Questions isolated S3'));
  assert.ok(tests.run.includes('photos.legacy.test.ts'));
  assert.ok(tests.run.includes('questionCloudJob.test.ts'));
  assert.match(ci.jobs['cloudru-media-contracts'].steps.map(s => s.run ?? '').join(','),
    /questions-public-readiness.test.mjs/);
});

test('manual reusable production deploy performs same Questions preflight before SSH', () => {
  const job = deploy.jobs['deploy-production'];
  const guarded = job.steps.findIndex(s => s.name === 'Verify isolated Questions CDN readiness before SSH (read-only)');
  const ssh = job.steps.findIndex(s => s.name === 'Deploy to production server');
  assert.ok(guarded >= 0 && ssh > guarded);
  const step = job.steps[guarded];
  assert.equal(step.run, 'node infra/cloudru/questions-public-readiness.mjs');
  assert.equal(step.env.QUESTIONS_PUBLIC_S3_ENABLED, runtimeFlag);
  assert.equal(step.env.QUESTIONS_CLOUD_JOB_ENABLED, jobFlag);
  assert.equal(step.env.QUESTIONS_PROCESSOR_READY, readyFlag);
  assert.equal(step.env.QUESTIONS_CDN_LIVE_VERIFIED, liveFlag);
  assert.ok(step.env.BEGET_CDN_API_TOKEN.includes('secrets.BEGET_CDN_API_TOKEN'));
  for (const [key,value] of Object.entries(target)) assert.equal(step.env[key], value);
});

test('production writes new public-Questions routing only, preserving existing private S3 documents', () => {
  const job = deploy.jobs['deploy-production'];
  const ssh = job.steps.find(s => s.name === 'Deploy to production server');
  const script = Object.entries(ssh.env).filter(([key]) => key.startsWith('DEPLOY_SCRIPT_')).map(([,value]) => value).join('\n');
  for (const [key, value] of Object.entries(target))
    assert.ok(script.includes('echo "'+key+'='+value+'"'),key);
  assert.ok(script.includes('echo "QUESTIONS_PUBLIC_S3_ENABLED='+runtimeFlag+'"'));
  assert.ok(script.includes('echo "QUESTIONS_CDN_LIVE_VERIFIED='+liveFlag+'"'));
  assert.ok(script.includes('echo "QUESTIONS_CLOUD_JOB_ENABLED='+jobFlag+'"'));
  assert.ok(script.includes('echo "QUESTIONS_PROCESSOR_READY='+readyFlag+'"'));
  assert.ok(script.includes('echo "CLOUDRU_QUESTIONS_BUCKET=gafus-documents-private"'));
  assert.ok(script.includes('echo "CLOUDRU_DOCUMENTS_BUCKET=gafus-documents-private"'));
  assert.equal((compose.match(/QUESTIONS_PUBLIC_S3_ENABLED=\$\{QUESTIONS_PUBLIC_S3_ENABLED:-false\}/g) || []).length, 3);
  for (const key of Object.keys(target)) assert.equal((compose.match(new RegExp(key + '=\\$\\{', 'g'))||[]).length, 3, key);
  assert.equal((compose.match(/QUESTIONS_PUBLIC_S3_BUCKET_VERSIONING=\$\{QUESTIONS_PUBLIC_S3_BUCKET_VERSIONING:-disabled\}/g) || []).length, 3);
  assert.ok(!script.includes('CLOUDRU_QUESTIONS_BUCKET=gafus-questions-public'));
  const cutover=Object.entries(ssh.env).filter(([name])=>name.startsWith('DEPLOY_SCRIPT_'))
    .map(([,value])=>value).join('\n');
  assert.ok(cutover.includes('QUESTIONS_FIRST_DEPLOY_ALL_RUNTIMES_READY=true'));
  assert.ok(cutover.indexOf('QUESTIONS_FIRST_DEPLOY_ALL_RUNTIMES_READY=true') <
    cutover.lastIndexOf('bash "$CUTOVER_SCRIPT" open'));
  assert.ok(cutover.includes('gafus-api gafus-web gafus-worker'));
});
