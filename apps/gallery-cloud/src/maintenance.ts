import { sharpGalleryEngine } from './sharp-engine.js';
import { createGalleryCloudWorker } from './worker.js';
import { cloudCore, cloudObjects, cloudQueue } from './runtime.js';
import { emitGalleryTelemetry } from './telemetry.js';
let worker: ReturnType<typeof createGalleryCloudWorker>;
export async function handler() {
  worker ??= createGalleryCloudWorker({ core: cloudCore(), objects: cloudObjects(), engine: sharpGalleryEngine, queue: cloudQueue(), enabled: process.env.GALLERY_ENABLED === 'true', telemetry: emitGalleryTelemetry });
  await worker.maintenance();
  return { statusCode: 200, body: '' };
}
