import { createServer } from "node:http";
import { createFeedCloudInternalClient } from "@gafus/feed-cloud";
import { createFeedCloudObjects } from "./objects.js";
import { createFeedCloudWorker } from "./worker.js";
// Container Jobs exit after one bounded invocation; HTTP mode is retained for existing triggers.
export async function processFeedJobs(): Promise<number> {
  const key = Buffer.from(process.env.FEED_INTERNAL_HMAC_SECRET ?? "", "utf8");
  const core = createFeedCloudInternalClient({
    baseUrl: process.env.FEED_INTERNAL_BASE_URL ?? "",
    key,
  });
  // Cleanup, retention and recovery are owned by the always-on GAFUS Worker.
  // The Cloud.ru Job exclusively transcodes a verified 720p into 360p.
  const worker = createFeedCloudWorker({
    core,
    objects: createFeedCloudObjects(),
    onMetrics: metrics => process.stdout.write(`FEED_MEDIA_V2_METRIC ${JSON.stringify(metrics)}\n`),
  });
  const workerType = process.env.FEED_WORKER_TYPE;
  if (workerType !== "video") throw new Error("INVALID_FEED_WORKER_TYPE: photo processing Jobs were removed");
  let jobs: Awaited<ReturnType<typeof core.claimJobs>>;
  try {
    jobs = await core.claimJobs(1, workerType);
  } catch {
    console.error("FEED_MEDIA_V2_RUNTIME_FAILURE", JSON.stringify({ phase: "claim", kind: workerType }));
    throw new Error("FEED_CLAIM_FAILED");
  }
  for (const job of jobs) await worker.process(job);
  return jobs.length;
}
let running = false;
// The Yandex container is private: only its dedicated trigger service account can invoke it.
const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST" || request.url !== "/") {
    response.writeHead(404).end();
    return;
  }
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 16_384) {
      response.writeHead(413).end();
      request.destroy();
      return;
    }
  }
  if (running) {
    response.writeHead(503).end();
    return;
  }
  running = true;
  try {
    const processed = await processFeedJobs();
    response
      .writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify({ processed }));
  } catch {
    // Never log signed URLs, source keys, request headers or provider errors with credentials.
    console.error("FEED_CLOUD_INVOCATION_FAILED");
    response.writeHead(503).end();
  } finally {
    running = false;
  }
});
if (process.env.FEED_RUN_ONCE === "true") {
  processFeedJobs()
    .then(() => {
      process.exitCode = 0;
    })
    .catch(() => {
      console.error("FEED_CLOUD_INVOCATION_FAILED");
      process.exitCode = 1;
    });
} else {
  server.listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
}
process.on("SIGTERM", () => server.close());
