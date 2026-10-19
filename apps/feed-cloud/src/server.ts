import { createServer } from "node:http";
import { createFeedCloudInternalClient } from "@gafus/feed-cloud";
import { createFeedCloudObjects } from "./objects.js";
import { sharpFeedEngine } from "./sharp-engine.js";
import { createFeedCloudWorker } from "./worker.js";
// Container Jobs exit after one bounded invocation; HTTP mode is retained for existing triggers.
export async function processFeedJobs(): Promise<number> {
  const started = performance.now();
  let phase = "configure";
  const metric = (name: string, elapsed: number) =>
    console.log(JSON.stringify({ event: "feed_invocation_stage", stage: name,
      durationMs: Math.round(elapsed) }));
  const key = Buffer.from(process.env.FEED_INTERNAL_HMAC_SECRET ?? "", "utf8");
  const core = createFeedCloudInternalClient({
    baseUrl: process.env.FEED_INTERNAL_BASE_URL ?? "",
    key,
  });
  const workerType = process.env.FEED_WORKER_TYPE;
  if (workerType !== "photo" && workerType !== "video") throw new Error("INVALID_FEED_WORKER_TYPE");
  // Distinguish startup, Core maintenance, claim, processing and total time;
  // the external queue-to-container cold-start delay still requires Cloud.ru logs.
  console.log(JSON.stringify({ event: "feed_invocation_start", workerType,
    processUptimeMs: Math.round(process.uptime() * 1000) }));
  try {
    phase = "maintenance";
    const maintenanceStarted = performance.now();
    // Cleanup and recovery remain active when new publications are disabled.
    await core.maintenance(20);
    metric("maintenance", performance.now() - maintenanceStarted);
    const worker = createFeedCloudWorker({
      core,
      objects: createFeedCloudObjects(),
      engine: sharpFeedEngine,
    });
    phase = "claim";
    const claimStarted = performance.now();
    const jobs = await core.claimJobs(1, workerType);
    metric("claim", performance.now() - claimStarted);
    phase = "process";
    for (const job of jobs) await worker.process(job);
    metric("total", performance.now() - started);
    return jobs.length;
  } catch (error) {
    console.error(JSON.stringify({ event: "feed_invocation_failure", stage: phase,
      workerType, durationMs: Math.round(performance.now() - started) }));
    throw error;
  }
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
