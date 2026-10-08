import { sharpGalleryEngine } from './sharp-engine.js';
import { createGalleryCloudWorker } from './worker.js';
import { cloudCore, cloudObjects, cloudQueue } from './runtime.js';
import { emitGalleryTelemetry } from './telemetry.js';
import { galleryEventUploadIds, type GalleryEvent } from './events.js';
let worker: ReturnType<typeof createGalleryCloudWorker>;
export async function handler(event: GalleryEvent) {
  const deadline = Date.now() + 50_000;
  worker ??= createGalleryCloudWorker({ core: cloudCore(), objects: cloudObjects(), engine: sharpGalleryEngine, queue: cloudQueue(), enabled: process.env.GALLERY_ENABLED === 'true', telemetry: emitGalleryTelemetry });
  for (const id of galleryEventUploadIds(event, process.env.GALLERY_BUCKET ?? '')) await worker.processUpload(id, deadline);
  return { statusCode: 200, body: '' };
}
