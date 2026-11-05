import { createGalleryObjectStore } from "@gafus/gallery-storage/objects";
import { createGalleryInternalClient } from "./internal.js";
import { createGalleryCloudWorker } from "./worker.js";
import { emitGalleryTelemetry } from "./telemetry.js";

// A bounded Container Job drains durable work from core without Yandex Message Queue.
// Attempt tokens and leases remain owned by core, including overlapping invocations.
const jobConfigNames = [
  "GALLERY_INTERNAL_BASE_URL",
  "GALLERY_INTERNAL_HMAC_SECRET",
  "GALLERY_BUCKET",
  "GALLERY_S3_ENDPOINT",
  "GALLERY_S3_ACCESS_KEY_ID",
  "GALLERY_S3_SECRET_ACCESS_KEY",
] as const;
const hasJobConfiguration = jobConfigNames.some(
  (key) => process.env[key] !== undefined,
);
// A disabled and entirely unconfigured LOCAL image must be safe to start:
// do not contact any provider or expect production credentials. A configured
// disabled Cloud Job MUST still drain durable delete/vetPreview tasks.
if (process.env.GALLERY_ENABLED === "false" && !hasJobConfiguration) {
  console.log("GALLERY_CLOUD_DORMANT");
} else {
const worker = createGalleryCloudWorker({
  core: createGalleryInternalClient({
    baseUrl: process.env.GALLERY_INTERNAL_BASE_URL ?? "",
    secret: process.env.GALLERY_INTERNAL_HMAC_SECRET ?? "",
  }),
  objects: createGalleryObjectStore({
    bucket: process.env.GALLERY_BUCKET ?? "",
    endpoint: process.env.GALLERY_S3_ENDPOINT ?? "https://s3.cloud.ru",
    accessKeyId: process.env.GALLERY_S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.GALLERY_S3_SECRET_ACCESS_KEY ?? "",
    cacheableFinalEnabled: process.env.GALLERY_CDN_CACHEABLE_FINAL_ENABLED === "true",
  }),
  telemetry: emitGalleryTelemetry,
});
worker.maintenance().catch(() => {
  console.error("GALLERY_CLOUD_INVOCATION_FAILED");
  process.exitCode = 1;
});
}
