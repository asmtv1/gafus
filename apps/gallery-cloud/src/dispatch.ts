import { galleryEventUploadIds, type GalleryEvent } from './events.js';
import { cloudQueue } from './runtime.js';
let queue: ReturnType<typeof cloudQueue>;
export async function handler(event: GalleryEvent) {
  if (process.env.GALLERY_ENABLED !== 'true') return { statusCode: 200, body: '' };
  queue ??= cloudQueue();
  for (const id of galleryEventUploadIds(event, process.env.GALLERY_BUCKET ?? '')) await queue.send(id);
  return { statusCode: 200, body: '' };
}
