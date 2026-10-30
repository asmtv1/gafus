/**
 * One-shot REAL Gallery Cloud Sharp worker for the dedicated local browser E2E.
 * Exact local DB, exact loopback S3, and an existing test-owned upload only.
 */
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { createGalleryStorageFromEnv } from "@gafus/gallery-storage";
import { galleryStorageConfigFromEnv } from "@gafus/gallery-storage/config";
import { createGalleryObjectStore } from "@gafus/gallery-storage/objects";
import { createGalleryService } from "@gafus/core/services/gallery";
import { createGalleryCloudWorker } from "./worker.js";
import { sharpGalleryEngine } from "./sharp-engine.js";
import type { GalleryInternalClient } from "./internal.js";
import type { PrismaClient } from "@gafus/prisma";

const dbUrl = "postgresql://asmtv1@127.0.0.1:5432/gafus_gallery_v2_test_20261028";
if (realpathSync(process.cwd()) !== "/Users/asmtv1/Desktop/gafus-refactor/apps/api" ||
    process.env.DATABASE_URL !== dbUrl ||
    process.env.GAFUS_ISOLATED_NONPROD_S3 !== "enabled" ||
    process.env.GAFUS_ISOLATED_S3_ENDPOINT !== "http://127.0.0.1:9000" ||
    process.env.GAFUS_ISOLATED_S3_GALLERY_BUCKET !== "gafus-refactor-gallery-test" ||
    process.env.GAFUS_LOCAL_ISOLATED_API !== "1" ||
    process.env.NODE_ENV !== "development" ||
    process.env.GALLERY_ENABLED !== "true")
  throw Error("GALLERY_BROWSER_WORKER_ISOLATION_DENIED");
const ownerId = process.env.GALLERY_V2_BROWSER_OWNER_ID ?? "";
const uploadId = process.env.GALLERY_V2_BROWSER_UPLOAD_ID ?? "";
if (!/^[A-Za-z0-9_-]{10,64}$/.test(ownerId) ||
    !/^[A-Za-z0-9_-]{10,64}$/.test(uploadId)) throw Error("UNTRUSTED_BROWSER_FIXTURE_IDS");

const require = createRequire(new URL("../../../packages/prisma/package.json", import.meta.url));
const Prisma = require("@prisma/client").PrismaClient as new (args: {
  datasources: { db: { url: string } };
}) => PrismaClient;
const db = new Prisma({ datasources: { db: { url: dbUrl } } });
try {
  const upload = await db.galleryUpload.findUnique({
    where: { id: uploadId }, include: { photo: true },
  });
  const action = process.env.GALLERY_V2_BROWSER_WORKER_ACTION ?? "process";
  const ownedUser = await db.user.findUnique({ where: { id: ownerId } });
  if (!upload || upload.ownerId !== ownerId ||
      upload.photo.ownerId !== ownerId ||
      !ownedUser?.username.startsWith("galleryv2browser_") ||
      !["process", "delete"].includes(action) ||
      (action === "process" && upload.status !== "uploaded") ||
      (action === "delete" && (!upload.photo.deletedAt || !upload.photo.thumbKey ||
        !upload.photo.fullKey)))
    throw Error("UNTRUSTED_BROWSER_WORKER_UPLOAD");
  const config = {
    NODE_ENV: "development", GAFUS_LOCAL_ISOLATED_API: "1",
    GAFUS_ISOLATED_NONPROD_S3: "enabled",
    GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000",
    GAFUS_ISOLATED_S3_GALLERY_BUCKET: "gafus-refactor-gallery-test",
    GALLERY_ENABLED: "true",
  };
  const objects = createGalleryObjectStore(galleryStorageConfigFromEnv(config));
  const signer = createGalleryStorageFromEnv(config);
  const service = createGalleryService({ db, storage: { ...signer, head: objects.head } });
  const core: GalleryInternalClient = {
    claimUpload: id => service.claimUpload({ uploadId: id }),
    completeUpload: input => service.completeUpload(input),
    failUpload: input => service.failUpload(input),
    claimJobs: (limit, id) => service.claimStorageJobs({ limit, uploadId: id }),
    completeJob: input => service.completeStorageJob(input),
    failJob: input => service.failStorageJob(input),
    maintenance: limit => service.maintenance({ limit }),
  };
  const worker = createGalleryCloudWorker({
    core, objects, engine: sharpGalleryEngine,
    queue: { async send() { /* test-owned local invocation, no cloud queue */ } },
  });
  if (action === "process") {
    await worker.processUpload(uploadId);
    const photo = await db.galleryPhoto.findUniqueOrThrow({
      where: { id: upload.photoId },
    });
    if (photo.status !== "ready" || !photo.thumbKey || !photo.fullKey ||
        !photo.thumbKey.startsWith("gallery/" + ownerId + "/media/") ||
        !photo.fullKey.startsWith("gallery/" + ownerId + "/media/") ||
        (await objects.head(photo.thumbKey))?.contentType !== "image/webp" ||
        (await objects.head(photo.fullKey))?.contentType !== "image/webp")
      throw Error("BROWSER_SHARP_WORKER_NOT_READY");
    console.log("GALLERY_REAL_HTTP_SHARP_WORKER_ATOMIC_READY=PASS");
  } else {
    const photo = upload.photo;
    const job = await db.galleryStorageJob.findUniqueOrThrow({
      where: { dedupeKey: "photo:" + photo.id + ":" + photo.albumId },
    });
    if (job.ownerId !== ownerId || job.kind !== "delete" ||
        !job.sourceKeys.includes(photo.thumbKey!) ||
        !job.sourceKeys.includes(photo.fullKey!)) throw Error("UNTRUSTED_DELETE_JOB");
    const [claimed] = await service.claimStorageJobs({
      limit: 1, exactDelete: { jobId: job.id, ownerId },
    });
    if (!claimed || claimed.kind !== "delete") throw Error("DELETE_JOB_NOT_CLAIMED");
    await worker.processJob(claimed, Date.now() + 50_000);
    if ((await objects.head(photo.thumbKey!)) ||
        (await objects.head(photo.fullKey!))) throw Error("FINAL_WEBPS_NOT_DELETED");
    console.log("GALLERY_REAL_HTTP_DURABLE_S3_DELETE=PASS");
  }
} finally {
  await db.$disconnect();
}
