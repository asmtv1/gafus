/**
 * Local Gallery V2 Sharp processing for GAFUS Refactor only.
 * Reads confirmed uploaded rows from the isolated WORK database and writes
 * thumbnails/full WebP to the loopback private MinIO. No production access.
 */
import { realpathSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { createGalleryStorageFromEnv } from "../../packages/gallery-storage/src/index";
import { galleryStorageConfigFromEnv } from "../../packages/gallery-storage/src/config";
import { createGalleryObjectStore } from "../../packages/gallery-storage/src/objects";
import { sourceUploadId } from "../../packages/gallery-storage/src/keys";
import { createGalleryService } from "../../packages/core/src/services/gallery";
import { createGalleryCloudWorker } from "../../apps/gallery-cloud/src/worker";
import { sharpGalleryEngine } from "../../apps/gallery-cloud/src/sharp-engine";
import type { GalleryInternalClient } from "../../apps/gallery-cloud/src/internal";

const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const e = process.env;
const dbUrl = new URL(e.DATABASE_URL ?? "http://invalid");
const forbidden = ["GALLERY_S3_ENDPOINT", "GALLERY_S3_ACCESS_KEY_ID",
  "GALLERY_S3_SECRET_ACCESS_KEY", "GALLERY_BUCKET", "GALLERY_INTERNAL_BASE_URL",
  "CLOUDRU_S3_ACCESS_KEY_ID", "CLOUDRU_S3_SECRET_ACCESS_KEY"];
if (realpathSync(process.cwd()) !== ROOT ||
    dbUrl.protocol !== "postgresql:" && dbUrl.protocol !== "postgres:" ||
    dbUrl.hostname !== "127.0.0.1" || dbUrl.port !== "55921" ||
    dbUrl.pathname !== "/gafus_refactor_real_work_20261024" ||
    e.NODE_ENV !== "development" || e.GAFUS_LOCAL_ISOLATED_API !== "1" ||
    e.GAFUS_ISOLATED_NONPROD_S3 !== "enabled" ||
    e.GAFUS_ISOLATED_S3_ENDPOINT !== "http://127.0.0.1:9000" ||
    e.GAFUS_ISOLATED_S3_GALLERY_BUCKET !== "gafus-refactor-gallery-test" ||
    forbidden.some(key => Boolean(e[key])) ||
    !["--once", "--serve"].includes(process.argv[2] ?? "") ||
    process.argv.length !== 3) {
  throw Error("LOCAL_GALLERY_WORKER_ISOLATION_DENIED");
}
const configEnv = { ...e, GALLERY_ENABLED: "true" };
const config = galleryStorageConfigFromEnv(configEnv);
if (config.isolatedNonprod !== true ||
    config.endpoint !== "http://127.0.0.1:9000" ||
    config.bucket !== "gafus-refactor-gallery-test") {
  throw Error("LOCAL_GALLERY_WORKER_STORAGE_DENIED");
}
const db = new PrismaClient();
const objects = createGalleryObjectStore(config);
const signer = createGalleryStorageFromEnv(configEnv);
const service = createGalleryService({ db, storage: { ...signer, head: objects.head } });
const core: GalleryInternalClient = {
  claimUpload: id => service.claimUpload({ uploadId: id }),
  completeUpload: input => service.completeUpload(input),
  failUpload: input => service.failUpload(input),
  claimJobs: (limit, uploadId) => service.claimStorageJobs({ limit, uploadId }),
  completeJob: input => service.completeStorageJob(input),
  failJob: input => service.failStorageJob(input),
  maintenance: limit => service.maintenance({ limit }),
};
const worker = createGalleryCloudWorker({
  core, objects, engine: sharpGalleryEngine,
  queue: { async send() { /* Local confirmed upload: polled by this worker. */ } },
});
let running = true;
process.on("SIGINT", () => { running = false; });
process.on("SIGTERM", () => { running = false; });
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function poll(): Promise<{ processed: number; failed: number; skipped: number }> {
  const rows = await db.galleryUpload.findMany({
    where: { status: "uploaded", photo: { status: "pending", deletedAt: null } },
    select: { id: true, sourceKey: true },
    orderBy: { createdAt: "asc" }, take: 10,
  });
  let processed = 0, failed = 0, skipped = 0;
  for (const row of rows) {
    if (!running) break;
    try {
      // Uploaded legacy rows from the WORK snapshot must not be modified if
      // their source object was never uploaded into isolated MinIO.
      if (sourceUploadId(row.sourceKey) !== row.id ||
          !await objects.head(row.sourceKey, AbortSignal.timeout(5000))) {
        skipped++;
        continue;
      }
      await worker.processUpload(row.id);
      const result = await db.galleryUpload.findUnique({
        where: { id: row.id }, select: { status: true },
      });
      if (result?.status === "ready") processed++;
      else failed++;
    } catch (error) {
      failed++;
      console.error("LOCAL_GALLERY_V2_FAILURE", error instanceof Error ? error.name : "unknown");
    }
  }
  return { processed, failed, skipped };
}
async function main() {
  try {
    while (running) {
      const result = await poll();
      if (result.processed || result.failed || result.skipped || process.argv[2] === "--once") {
        console.log("LOCAL_GALLERY_V2_STATUS", JSON.stringify(result));
      }
      if (process.argv[2] === "--once") {
        if (result.failed) process.exitCode = 1;
        break;
      }
      await sleep(2500);
    }
  } finally {
    await db.$disconnect();
  }
}
void main().catch(error => {
  console.error("LOCAL_GALLERY_V2_FATAL", error instanceof Error ? error.name : "unknown");
  process.exitCode = 1;
});
