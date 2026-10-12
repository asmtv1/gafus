import { createGalleryObjectStore } from "@gafus/gallery-storage/objects";
import { createGalleryInternalClient } from "./internal.js";
import { sharpGalleryEngine } from "./sharp-engine.js";
import { createGalleryCloudWorker } from "./worker.js";
import { emitGalleryTelemetry } from "./telemetry.js";

// A bounded Container Job drains durable work from core without Yandex Message Queue.
// Attempt tokens and leases remain owned by core, including overlapping invocations.
const deadline = Date.now() + 50_000;
const worker = createGalleryCloudWorker({
  core: createGalleryInternalClient({
    baseUrl: process.env.GALLERY_INTERNAL_BASE_URL ?? "",
    secret: process.env.GALLERY_INTERNAL_HMAC_SECRET ?? "",
  }),
  objects: createGalleryObjectStore({
    bucket: process.env.GALLERY_BUCKET ?? "",
    endpoint: process.env.GALLERY_S3_ENDPOINT ?? "https://storage.yandexcloud.net",
    accessKeyId: process.env.GALLERY_S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.GALLERY_S3_SECRET_ACCESS_KEY ?? "",
  }),
  engine: sharpGalleryEngine,
  enabled: process.env.GALLERY_ENABLED === "true",
  queue: {
    async send(uploadId) {
      if (Date.now() + 10_000 >= deadline) throw new Error("INVOCATION_DEADLINE");
      await worker.processUpload(uploadId, deadline);
    },
  },
  telemetry: emitGalleryTelemetry,
});
worker.maintenance().catch(() => {
  console.error("GALLERY_CLOUD_INVOCATION_FAILED");
  process.exitCode = 1;
});
