import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workerSourceFingerprint, pinnedWorkerImage, workerImages, workerSources } from './worker-image-pins.mjs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const yaml=require('yaml');

const hex='a'.repeat(64);
function pins() {
  const env={};
  for(const media of Object.keys(workerSources)) {
    const prefix=`CLOUDRU_${media.toUpperCase()}_WORKER`;
    env[prefix+'_IMAGE']=`gafus.cr.cloud.ru/gafus-${media}-worker@sha256:${hex}`;
    env[prefix+'_SOURCE']=workerSourceFingerprint(media);
  }
  return env;
}

test('three fingerprints use independent, reviewed Dockerfile COPY trees',()=> {
  assert.deepEqual(Object.keys(workerSources), ['gallery','feed','questions']);
  assert.equal(workerSources.gallery.length,4);
  assert.equal(workerSources.feed.length,4);
  assert.deepEqual(workerSources.questions,['apps/questions-cloud/Dockerfile','apps/questions-cloud/src']);
  const fingerprints=Object.keys(workerSources).map(k=>workerSourceFingerprint(k));
  assert.ok(fingerprints.every(x=>/^[a-f0-9]{64}$/.test(x)));
  assert.equal(new Set(fingerprints).size,3);
});

test('pinned images are independent of current web/API Git SHA',()=> {
  const all=workerImages(pins());
  assert.deepEqual(Object.keys(all), ['gallery-worker','feed-worker','questions-worker']);
  assert.ok(Object.values(all).every(x=>x.endsWith(`@sha256:${hex}`)));
  assert.ok(Object.values(all).every(x=>!x.includes(':latest')));
});

test('missing pins, stale worker sources and mutable or wrong repository refs fail closed',()=>{
  for(const media of Object.keys(workerSources)){
    const current=pins();
    assert.equal(pinnedWorkerImage(media,current),current[`CLOUDRU_${media.toUpperCase()}_WORKER_IMAGE`]);
    delete current[`CLOUDRU_${media.toUpperCase()}_WORKER_IMAGE`];
    assert.throws(()=>pinnedWorkerImage(media,current),/PIN_MISSING/);
    const changed=pins();
    changed[`CLOUDRU_${media.toUpperCase()}_WORKER_SOURCE`]='b'.repeat(64);
    assert.throws(()=>pinnedWorkerImage(media,changed),/SOURCE_CHANGED/);
    const bad=pins();
    bad[`CLOUDRU_${media.toUpperCase()}_WORKER_IMAGE`]=`gafus.cr.cloud.ru/gafus-${media}-worker:latest`;
    assert.throws(()=>pinnedWorkerImage(media,bad),/PIN_INVALID/);
    const wrong=pins();
    wrong[`CLOUDRU_${media.toUpperCase()}_WORKER_IMAGE`]=`gafus.cr.cloud.ru/gafus-other-worker@sha256:${hex}`;
    assert.throws(()=>pinnedWorkerImage(media,wrong),/PIN_INVALID/);
  }
});

test('fingerprints change if any Dockerfile or transitive copied source tree changes',()=>{
  const media='feed'; const current=workerSourceFingerprint(media);
  const next=workerSourceFingerprint(media,(path)=>path==='packages/feed-storage/src'?'f'.repeat(40):'e'.repeat(40));
  assert.notEqual(next,current);
  assert.throws(()=>workerSourceFingerprint(media,()=>''),/INVALID_WORKER_GIT_TREE/);
});

test('normal GitHub CI never builds, pushes, patches or provisions Cloud.ru jobs',()=>{
  const workflow=yaml.parse(readFileSync('.github/workflows/ci-cd.yml','utf8'));
  assert.ok(!workflow.jobs['cloudru-build-media-images']);
  assert.match(workflow.jobs['cloudru-prepare-media'].if, /vars.CLOUDRU_WORKER_PINS_REQUIRED == 'true'/);
  const release=workflow.jobs['cloudru-prepare-media'];
  assert.ok(release.steps.some(x=>x.run==='node infra/cloudru/worker-image-pins.mjs --check'));
  assert.ok(release.steps.some(x=>x.run==='node infra/cloudru/production-media-release.mjs --verify'));
  assert.ok(!release.steps.some(x=>x.run?.includes('production-media-release.mjs --prepare')));
  const manual=yaml.parse(readFileSync('.github/workflows/cloudru-media-images.yml','utf8'));
  assert.equal(manual.jobs.build.environment,'production');
  assert.deepEqual(manual.jobs.build.strategy.matrix.include.map(x=>x.media),['feed','gallery','questions']);
  assert.deepEqual(manual.on.workflow_dispatch.inputs.media.options, ['all','feed','gallery','questions']);
  for (const step of manual.jobs.build.steps) {
    if (step.name?.includes('Authenticate to private Cloud.ru') ||
        step.name?.includes('Report independently pinned')) {
      assert.match(step.if, /inputs.media == matrix.media/);
    }
  }
  assert.equal(manual.permissions.packages, 'write');
  const feedRelay=manual.jobs.build.steps.find(x=>x.name?.startsWith('Transfer Feed GHCR image'));
  assert.ok(feedRelay);
  assert.match(feedRelay.if, /matrix.media == 'feed'/);
  assert.match(feedRelay.uses, /^appleboy\/ssh-action@/);
  const apply=yaml.parse(readFileSync('.github/workflows/cloudru-apply-worker-pins.yml','utf8'));
  assert.match(apply.jobs['apply-pins'].if,/approved|apply-reviewed-worker-pins/);
  assert.ok(apply.jobs['apply-pins'].steps.some(x=>x.run==='node infra/cloudru/production-media-release.mjs --prepare'));
});

test('API deploy, including manual Deploy Only, verifies all six live pinned Cloud.ru Jobs before SSH', () => {
  const deploy=yaml.parse(readFileSync('.github/workflows/production-deploy-reusable.yml','utf8'));
  const steps=deploy.jobs['deploy-production'].steps;
  const ssh=steps.findIndex(x=>x.name==='Deploy to production server');
  const login=steps.findIndex(x=>x.name==='Authenticate to Cloud.ru media Registry for six-Job verification');
  const verify=steps.findIndex(x=>x.name==='Verify all six pinned Cloud.ru media Jobs before API deployment (read-only)');
  assert.ok(login>=0 && verify>login && ssh>verify);
  assert.equal(steps[login].uses,'docker/login-action@v3');
  assert.equal(steps[login].with.registry,'gafus.cr.cloud.ru');
  assert.equal(steps[verify].run.trim(),
    'node infra/cloudru/worker-image-pins.mjs --check\nnode infra/cloudru/production-media-release.mjs --verify');
  const env=steps[verify].env;
  assert.equal(env.GITHUB_SHA,'${{ inputs.release_sha }}');
  assert.equal(env.GITHUB_REF,'${{ github.ref }}');
  assert.equal(env.GITHUB_EVENT_NAME,'${{ github.event_name }}');
  for(const media of ['GALLERY','FEED','QUESTIONS']) {
    assert.equal(env['CLOUDRU_'+media+'_WORKER_IMAGE'],'${{ vars.CLOUDRU_'+media+'_WORKER_IMAGE }}');
    assert.equal(env['CLOUDRU_'+media+'_WORKER_SOURCE'],'${{ vars.CLOUDRU_'+media+'_WORKER_SOURCE }}');
  }
  for(const secret of ['CLOUDRU_PROJECT_ID','CLOUDRU_KEY_ID','CLOUDRU_KEY_SECRET',
    'CLOUDRU_S3_ACCESS_KEY_ID','CLOUDRU_S3_SECRET_ACCESS_KEY',
    'GALLERY_CDN_SECRET','GALLERY_ORIGIN_SECRET',
    'GALLERY_INTERNAL_HMAC_SECRET','FEED_INTERNAL_HMAC_SECRET']) {
    assert.equal(env[secret],'${{ secrets.'+secret+' }}');
  }
  assert.equal(env.FEED_BUCKET_PUBLIC,'true');
  assert.equal(env.QUESTIONS_CLOUD_JOB_ENABLED,"${{ vars.QUESTIONS_CLOUD_JOB_ENABLED || 'true' }}");
  assert.ok(!steps[verify].run.includes('--prepare'));
  assert.ok(!steps[verify].run.includes('docker build'));
  assert.equal(deploy.jobs['deploy-production'].environment,'production');
});
