import { createServer } from "node:http";
import { createFeedCloudInternalClient } from "@gafus/feed-cloud";
import { createFeedCloudObjects } from "./objects.js";
import { sharpFeedEngine } from "./sharp-engine.js";
import { createFeedCloudWorker } from "./worker.js";
let running = false;
// The Yandex container is private: only its dedicated trigger service account can invoke it.
const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST" || request.url !== "/") { response.writeHead(404).end(); return; }
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 16_384) { response.writeHead(413).end(); request.destroy(); return; }
  }
  if (running) { response.writeHead(503).end(); return; }
  running = true;
  try {
    const key = Buffer.from(process.env.FEED_INTERNAL_HMAC_SECRET ?? "", "utf8");
    const core = createFeedCloudInternalClient({ baseUrl: process.env.FEED_INTERNAL_BASE_URL ?? "", key });
    // Cleanup and recovery remain active when new publications are disabled.
    await core.maintenance(20);
    const worker = createFeedCloudWorker({ core, objects: createFeedCloudObjects(), engine: sharpFeedEngine });
    const workerType = process.env.FEED_WORKER_TYPE;
    if (workerType !== "photo" && workerType !== "video") throw new Error("INVALID_FEED_WORKER_TYPE");
    const jobs = await core.claimJobs(1, workerType);
    for (const job of jobs) await worker.process(job);
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ processed: jobs.length }));
  } catch {
    // Never log signed URLs, source keys, request headers or provider errors with credentials.
    console.error("FEED_CLOUD_INVOCATION_FAILED");
    response.writeHead(503).end();
  } finally { running = false; }
});
server.listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
process.on("SIGTERM", () => server.close());
