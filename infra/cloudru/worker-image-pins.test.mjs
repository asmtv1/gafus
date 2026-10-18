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
  const apply=yaml.parse(readFileSync('.github/workflows/cloudru-apply-worker-pins.yml','utf8'));
  assert.match(apply.jobs['apply-pins'].if,/approved|apply-reviewed-worker-pins/);
  assert.ok(apply.jobs['apply-pins'].steps.some(x=>x.run==='node infra/cloudru/production-media-release.mjs --prepare'));
});
