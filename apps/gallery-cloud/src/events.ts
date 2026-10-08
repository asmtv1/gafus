import { sourceUploadId } from '@gafus/gallery-storage/keys';
export interface GalleryEvent { messages?: Array<{ event_metadata?: { event_type?: string }; details?: { bucket_id?: string; object_id?: string; message?: { body?: string } } }>; uploadId?: string; }
/** Only trusted platform invocations may call this. Object keys are not authorization. */
export function galleryEventUploadIds(event: GalleryEvent, bucket: string): string[] {
  const ids = new Set<string>();
  if (event.uploadId) { if (!/^[A-Za-z0-9_-]{1,128}$/.test(event.uploadId)) throw new Error('INVALID_QUEUE_BODY'); ids.add(event.uploadId); }
  if ((event.messages?.length ?? 0) > 10) throw new Error('EVENT_BATCH_LIMIT');
  for (const msg of event.messages ?? []) {
    if (msg.event_metadata?.event_type === 'yandex.cloud.events.storage.ObjectCreate' || msg.event_metadata?.event_type === 'yandex.cloud.events.storage.ObjectUpdate') {
      if (msg.details?.bucket_id !== bucket) continue;
      // Registry grammar contains server-generated IDs + source.ext only. No outputs loop.
      const id = sourceUploadId(msg.details?.object_id ?? '');
      if (id) ids.add(id);
    } else if (msg.event_metadata?.event_type === 'yandex.cloud.events.messagequeue.QueueMessage') {
      const body = msg.details?.message?.body ?? '';
      if (Buffer.byteLength(body) > 512) throw new Error('INVALID_QUEUE_BODY');
      const parsed = JSON.parse(body) as { uploadId?: string; version?: number };
      if (parsed.version !== 1 || !parsed.uploadId || !/^[A-Za-z0-9_-]{1,128}$/.test(parsed.uploadId)) throw new Error('INVALID_QUEUE_BODY');
      ids.add(parsed.uploadId);
    }
  }
  return [...ids];
}
