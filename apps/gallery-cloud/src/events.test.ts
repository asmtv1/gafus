import { describe, expect, it } from 'vitest';
import { galleryEventUploadIds } from './events';
const object = (key:string, bucket='private-gallery-dev') => ({event_metadata:{event_type:'yandex.cloud.events.storage.ObjectCreate'},details:{bucket_id:bucket,object_id:key}});
describe('platform event boundary', () => {
  it('deduplicates source events for all formats and ignores outputs/unregistered paths', () => {
    const messages = ['jpg','png','webp'].map(ext=>object(`albums/o/a/incoming/u/source.${ext}`));
    messages.push(object('albums/o/a/photos/p/full.webp'),object('albums/o/a/incoming/u/attempts/t/thumb.webp'),object('albums/o/a/incoming/u/source.png','other-bucket'),object('albums/o/a/incoming/u/../source.png'));
    expect(galleryEventUploadIds({messages},'private-gallery-dev')).toEqual(['u']);
  });
  it('accepts only a bounded versioned registered-ID queue payload', () => {
    const queue = (body:string) => ({messages:[{event_metadata:{event_type:'yandex.cloud.events.messagequeue.QueueMessage'},details:{message:{body}}}]});
    expect(galleryEventUploadIds(queue('{"version":1,"uploadId":"u"}'),'private-gallery-dev')).toEqual(['u']);
    for (const body of ['{"version":2,"uploadId":"u"}','{"version":1,"uploadId":"../u"}','x'.repeat(513)]) expect(()=>galleryEventUploadIds(queue(body),'private-gallery-dev')).toThrow();
  });
  it('rejects an oversized invocation batch', () => {
    expect(()=>galleryEventUploadIds({messages:Array.from({length:11},()=>object('albums/o/a/incoming/u/source.jpg'))},'private-gallery-dev')).toThrow('EVENT_BATCH_LIMIT');
  });
});
