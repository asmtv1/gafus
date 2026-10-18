import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloudruMediaManifests } from './media-manifests.mjs';
const project='12345678-1234-1234-1234-123456789012';
const sha='a'.repeat(40);
test('default Cloud.ru media plan preserves Gallery origin and all existing jobs', () => {
  const m=cloudruMediaManifests(project,sha,{feedPublic:true});
  assert.equal(m.services.some(x=>x.name==='gafus-gallery-origin'),true);
  assert.equal(m.services.some(x=>x.name==='gafus-feed-origin'),false);
  assert.ok(m.jobs.some(x=>x.name==='gafus-gallery-process'));
});
test('explicit Gallery redirect cutover stops generating old Gallery origin', () => {
  const m=cloudruMediaManifests(project,sha,{feedPublic:true,galleryRedirect:true});
  assert.equal(m.services.some(x=>x.name==='gafus-gallery-origin'),false);
  const gallery=m.jobs.find(x=>x.name==='gafus-gallery-process');
  assert.ok(gallery);
  assert.ok(gallery.template.containers[0].env.some(x=>x.name==='GALLERY_CDN_CACHEABLE_FINAL_ENABLED'));
  assert.ok(gallery.template.containers[0].env.some(x=>x.name==='GALLERY_CDN_EDGE_TOKEN_VERIFIED'));
});
