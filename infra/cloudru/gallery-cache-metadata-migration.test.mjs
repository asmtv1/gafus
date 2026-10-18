import test from 'node:test';
import assert from 'node:assert/strict';
import { isGalleryCacheableFinal, needsGalleryMetadataUpdate, migrateGalleryMetadata } from './gallery-cache-metadata-migration.mjs';
const key = 'albums/owner/album/photos/photo/full.webp';
const head = { ContentType: 'image/webp', ContentLength: 42, ETag: '"'+'a'.repeat(32)+'"', CacheControl: 'private, no-store' };
test('only final photos and veterinary thumbnails qualify, never private originals', () => {
  assert.equal(isGalleryCacheableFinal(key), true);
  assert.equal(isGalleryCacheableFinal('users/u/pets/p/vet-visits/v/a/thumb.webp'), true);
  for(const p of ['albums/owner/album/incoming/upload/source.jpg', 'albums/owner/album/incoming/u/attempts/1/full.webp',
    'users/u/pets/p/vet-visits/v/a/original.pdf', 'albums/o/a/photos/p/full.webp?x=1'])
    assert.equal(isGalleryCacheableFinal(p), false);
  assert.equal(needsGalleryMetadataUpdate(key, head), true);
  assert.equal(needsGalleryMetadataUpdate(key, { ...head, CacheControl: 'public, max-age=180, s-maxage=600, must-revalidate' }), false);
  assert.equal(needsGalleryMetadataUpdate(key, { ...head, ETag: 'bad' }), false);
});
test('plan only lists and reads metadata, never writes or logs keys', async () => {
  const calls=[];
  const client={ async send(command) { calls.push(command.constructor.name);
    if (command.constructor.name === 'ListObjectsV2Command')
      return { Contents: command.input.Prefix === 'albums/' ? [{Key:key}] : [] };
    if (command.constructor.name === 'HeadObjectCommand') return head;
    throw Error('UNEXPECTED_WRITE');
  } };
  const result=await migrateGalleryMetadata(client);
  assert.deepEqual(result,{scanned:1,finals:1,pending:1,changed:0,alreadyCacheable:0,rejected:0});
  assert.deepEqual(calls,['ListObjectsV2Command','HeadObjectCommand','ListObjectsV2Command']);
});
test('apply demands explicit confirmation before any network work', async()=>{
  let called=false;
  await assert.rejects(migrateGalleryMetadata({send:async()=>{called=true}}, {apply:true}), /REQUIRES_APPROVAL/);
  assert.equal(called,false);
});
