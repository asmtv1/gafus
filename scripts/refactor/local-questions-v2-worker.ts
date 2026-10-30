/**
 * Loopback-only Questions Photo V2 worker, mirroring the Cloud.ru Sharp job.
 * This process must never connect to Cloud.ru or GAFUS Main.
 */
import { realpathSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { createQuestionsV2Queue } from "../../apps/api/src/modules/questions/media-v2-jobs";
import { createQuestionsV2S3Objects } from "../../apps/feed-cloud/src/questions-v2-s3-objects";
import { createQuestionsV2JobRunner } from "../../apps/feed-cloud/src/questions-v2-job-runner";

const e = process.env;
const pg = new URL(e.DATABASE_URL ?? "http://invalid");
const denied = ["CLOUDRU_S3_ACCESS_KEY_ID", "CLOUDRU_S3_SECRET_ACCESS_KEY",
  "FEED_S3_ACCESS_KEY_ID", "FEED_S3_SECRET_ACCESS_KEY"];
if (realpathSync(process.cwd()) !== "/Users/asmtv1/Desktop/gafus-refactor" ||
    !["postgresql:", "postgres:"].includes(pg.protocol) ||
    pg.hostname !== "127.0.0.1" || pg.port !== "55921" ||
    pg.pathname !== "/gafus_refactor_real_work_20261024" ||
    e.NODE_ENV !== "development" || e.GAFUS_LOCAL_ISOLATED_API !== "1" ||
    e.QUESTIONS_V2_MEDIA_ENABLED !== "true" ||
    e.QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED !== "true" ||
    e.QUESTIONS_V2_S3_ENDPOINT !== "http://127.0.0.1:9000" ||
    e.QUESTIONS_V2_S3_BUCKET !== "gafus-refactor-questions-test" ||
    !e.QUESTIONS_V2_S3_ACCESS_KEY_ID || !e.QUESTIONS_V2_S3_SECRET_ACCESS_KEY ||
    denied.some(key => Boolean(e[key])) ||
    process.argv[2] !== "--serve" || process.argv.length !== 3) {
  throw Error("LOCAL_QUESTIONS_V2_ISOLATION_DENIED");
}
const db = new PrismaClient();
const core = createQuestionsV2Queue({ database: db });
const run = createQuestionsV2JobRunner({
  core: {
    claimOne: async () => (await core.claimOne()).jobs[0] ?? null,
    renew: core.renew,
    complete: core.complete,
    fail: core.fail,
  },
  objectsFor: createQuestionsV2S3Objects,
});
let live = true;
process.on("SIGTERM", () => { live = false; });
process.on("SIGINT", () => { live = false; });
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function main() {
  try {
    console.log("LOCAL_QUESTIONS_V2_WORKER_READY");
    while (live) {
      try {
        const processed = await run();
        if (processed) console.log("LOCAL_QUESTIONS_V2_IMAGE_READY");
        else {
          // The exact task cleanup is deferred until the signed POST replay
          // window closes. Reap only expired, locally owned outbox items.
          const cleaned=await core.cleanupPending();
          if (cleaned.cleaned) console.log("LOCAL_QUESTIONS_V2_CLEANUP_DONE");
          await sleep(1800);
        }
      } catch (err) {
        // Never emit source keys, personal information, secrets or S3 URLs.
        console.error("LOCAL_QUESTIONS_V2_PROCESS_FAILURE",
          err instanceof Error ? err.name : "unknown");
        await sleep(3500);
      }
    }
  } finally {
    await db.$disconnect();
  }
}
void main().catch(err => {
  console.error("LOCAL_QUESTIONS_V2_FATAL", err instanceof Error ? err.name : "unknown");
  process.exitCode = 1;
});
