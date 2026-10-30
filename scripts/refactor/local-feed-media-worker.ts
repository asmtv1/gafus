/**
 * Local-only Feed Media V2 worker for GAFUS Refactor.
 *
 * Runs the same Sharp/FFmpeg worker and Core job state machine as Cloud.ru,
 * but only against the isolated WORK PostgreSQL and the private loopback MinIO.
 * This MUST NEVER be used with production credentials or shared resources.
 */
import { realpathSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { createFeedStorageJobs } from "../../packages/core/src/services/feed/jobs";
import { createFeedStorage } from "../../packages/feed-storage/src/storage";
import { isolatedNonprodS3Config } from "../../packages/cdn-upload/src/isolatedNonprodS3";
import { createFeedCloudObjects } from "../../apps/feed-cloud/src/objects";
import { createFeedCloudWorker } from "../../apps/feed-cloud/src/worker";
import { sharpFeedEngine } from "../../apps/feed-cloud/src/sharp-engine";
import { assertFeedObjectKey } from "../../packages/feed-storage/src/keys";

const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const e = process.env;
const url = new URL(e.DATABASE_URL ?? "http://invalid");
const DENIED_KEYS = ["FEED_S3_ENDPOINT","FEED_S3_ACCESS_KEY_ID","FEED_S3_SECRET_ACCESS_KEY",
  "CLOUDRU_S3_ACCESS_KEY_ID","CLOUDRU_S3_SECRET_ACCESS_KEY","FEED_BUCKET",
  "GALLERY_S3_ENDPOINT","GALLERY_S3_ACCESS_KEY_ID","GALLERY_S3_SECRET_ACCESS_KEY"];
if (realpathSync(process.cwd()) !== ROOT ||
    (url.protocol !== "postgresql:" && url.protocol !== "postgres:") ||
    url.hostname !== "127.0.0.1" || url.port !== "55921" ||
    url.pathname !== "/gafus_refactor_real_work_20261024" ||
    e.NODE_ENV !== "development" || e.GAFUS_LOCAL_ISOLATED_API !== "1" ||
    e.GAFUS_ISOLATED_NONPROD_S3 !== "enabled" ||
    e.GAFUS_ISOLATED_S3_ENDPOINT !== "http://127.0.0.1:9000" ||
    e.GAFUS_ISOLATED_S3_FEED_BUCKET !== "gafus-refactor-feed-test" ||
    e.GAFUS_ISOLATED_S3_GALLERY_BUCKET !== "gafus-refactor-gallery-test" ||
    DENIED_KEYS.some(k => Boolean(e[k])) ||
    !["--once", "--serve"].includes(process.argv[2] ?? "") ||
    process.argv.length !== 3) {
  throw Error("LOCAL_FEED_MEDIA_WORKER_ISOLATION_DENIED");
}
const config = isolatedNonprodS3Config("feed", e);
if (!config || config.bucket !== "gafus-refactor-feed-test" ||
    config.endpoint !== "http://127.0.0.1:9000")
  throw Error("LOCAL_FEED_MEDIA_WORKER_STORAGE_DENIED");

const db = new PrismaClient();
const storage = createFeedStorage({
  enabled: true, isolatedNonprod: true, ...config, cdnBaseUrl: "", cdnSecret: "",
});
const jobs = createFeedStorageJobs({ db, storage });
const worker = createFeedCloudWorker({
  core: {
    claimJobs: (size, kind) => jobs.claim(size, kind),
    completeJob: (id, token, result) => jobs.complete(id, token, result),
    failJob: (id, token, code) => jobs.fail(id, token, code),
    renewJob: (id, token) => jobs.renew(id, token),
    maintenance: async () => { throw Error("LOCAL_MEDIA_WORKER_NO_MAINTENANCE"); },
  },
  objects: createFeedCloudObjects(e),
  engine: sharpFeedEngine,
  onMetrics: result => {
    console.log("LOCAL_FEED_V2_METRICS", JSON.stringify({
      kind: result.kind, attempt: result.attempt, sourceBytes: result.sourceBytes,
      outputBytes: result.outputBytes, totalMs: result.totalMs,
    }));
  },
});
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
let running = true;
process.on("SIGTERM", () => { running = false; });
process.on("SIGINT", () => { running = false; });

async function lane(kind: "photo" | "video") {
  let done = 0, failed = 0, seen = 0, legacySkipped = 0;
  while (running) {
    // Explicitly select canonical V2 jobs. The WORK snapshot also contains old
    // HLS cleanup jobs whose keys are outside the new strict V2 object contract.
    // Never lease those rows: an untrusted claim otherwise gets stuck for 120s.
    const at = new Date();
    const candidates = await db.feedStorageJob.findMany({
      where: {
        kind: { in: kind === "photo"
          ? ["publish_photo", "cleanup_source", "delete_keys"] : ["publish_video"] },
        OR: [{ status: "pending", availableAt: { lte: at } },
          { status: "processing", leaseUntil: { lt: at } }],
      },
      orderBy: [{ availableAt: "asc" }, { id: "asc" }],
      take: 100,
      select: { id: true, ownerId: true, kind: true, sourceKeys: true },
    });
    let selected: typeof candidates[number] | null = null;
    for (const candidate of candidates) {
      if (candidate.kind === "delete_keys" || candidate.kind === "cleanup_source") {
        try {
          for (const key of candidate.sourceKeys) assertFeedObjectKey(key);
        } catch {
          legacySkipped++;
          continue;
        }
      }
      selected = candidate;
      break;
    }
    if (!selected) {
      if (process.argv[2] === "--once") break;
      await sleep(2000);
      continue;
    }
    const claim = selected.kind === "publish_photo" || selected.kind === "publish_video"
      ? await jobs.claim(1, kind, undefined, {
          jobId: selected.id, ownerId: selected.ownerId, kind: selected.kind,
        })
      : await jobs.claim(1, "photo", {
          jobId: selected.id, ownerId: selected.ownerId, kind: selected.kind,
        });
    if (!claim.length) {
      if (process.argv[2] === "--once") break;
      await sleep(500);
      continue;
    }
    const job = claim[0]!;
    seen++;
    try {
      const result = await worker.process(job);
      if (result.accepted) done++;
      else failed++;
      console.log("LOCAL_FEED_V2_JOB", job.kind, result.accepted ? "ACK" : "STALE");
    } catch (error) {
      failed++;
      console.error("LOCAL_FEED_V2_JOB_FAILED", job.kind,
        error instanceof Error ? error.name : "unknown");
    }
    if (process.argv[2] === "--once" && seen >= 20) break;
  }
  return { kind, done, failed, seen, legacySkipped };
}

async function main() {
  try {
    // Photo and video work independently, as on the four approved Cloud.ru Jobs.
    const result = await Promise.all([lane("photo"), lane("video")]);
    console.log("LOCAL_FEED_V2_SUMMARY", JSON.stringify(result));
    if (result.some(item => item.failed)) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
// The normal isolated Feed dev daemon also starts Gallery V2 so confirmed
// album uploads cannot remain pending simply because only Feed was started.
// Gallery has its own strict DB/MinIO isolation gate and independent loop.
if (process.argv[2] === "--serve") {
  void import("./local-gallery-media-worker").catch(error => {
    console.error("LOCAL_GALLERY_V2_START_FAILED", error instanceof Error ? error.name : "unknown");
  });
}

void main().catch(error => {
  console.error("LOCAL_FEED_V2_FATAL", error instanceof Error ? error.name : "unknown");
  process.exitCode = 1;
});
