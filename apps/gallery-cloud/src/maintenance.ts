import { createGalleryCloudWorker } from './worker.js';
import { cloudCore, cloudObjects } from './runtime.js';
import { emitGalleryTelemetry } from './telemetry.js';
let worker: ReturnType<typeof createGalleryCloudWorker>;
export async function handler() {
  worker ??= createGalleryCloudWorker({ core: cloudCore(), objects: cloudObjects(), telemetry: emitGalleryTelemetry });
  await worker.maintenance();
  return { statusCode: 200, body: '' };
}
