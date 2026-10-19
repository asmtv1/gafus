import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { hostname, availableParallelism } from "node:os";
import { createFeedCloudInternalClient } from "@gafus/feed-cloud";
import { createFeedCloudObjects } from "./objects.js";
import { sharpFeedEngine } from "./sharp-engine.js";
import { createFeedCloudWorker } from "./worker.js";
import { classifyFeedFailure } from "./failure-diagnostics.js";
// Container Jobs exit after one bounded invocation; HTTP mode is retained for existing triggers.
export async function processFeedJobs(): Promise<number> {
  const started = performance.now();
  const safe = (value: string | undefined) => value && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)
    ? value : undefined;
  const jobName = process.env.FEED_JOB_NAME;
  const providerId = safe(process.env.CLOUDRU_EXECUTION_ID ??
    process.env.CLOUDRU_JOB_EXECUTION_NAME ?? process.env.CLOUD_RUN_EXECUTION ??
    process.env.JOB_EXECUTION_NAME);
  const trace = {
    invocationId: randomUUID(),
    ...(jobName && /^gafus-feed-(photo|video)(-2)?$/.test(jobName) ? { jobName } : {}),
    ...(providerId ? { executionId: providerId } : {}),
    ...(safe(hostname()) ? { hostId: safe(hostname())! } : {}),
  };
  let phase = "configure";
  const metric = (name: string, elapsed: number) =>
    console.log(JSON.stringify({ event: "feed_invocation_stage", stage: name,
      durationMs: Math.round(elapsed), trace }));
  const key = Buffer.from(process.env.FEED_INTERNAL_HMAC_SECRET ?? "", "utf8");
  const workerType = process.env.FEED_WORKER_TYPE;
  // Emit safe boot diagnostics even if Core configuration fails before the first claim.
  console.log(JSON.stringify({ event: "feed_invocation_start", workerType, trace,
    processUptimeMs: Math.round(process.uptime() * 1000),
    cpuCount: availableParallelism(),
    s3ConfigPresent: Boolean(process.env.FEED_BUCKET && process.env.FEED_S3_ACCESS_KEY_ID &&
      process.env.FEED_S3_SECRET_ACCESS_KEY), coreConfigPresent: Boolean(key.length &&
      process.env.FEED_INTERNAL_BASE_URL) }));
  try {
    phase = "configure";
    if (workerType !== "photo" && workerType !== "video") throw new Error("INVALID_FEED_WORKER_TYPE");
    const core = createFeedCloudInternalClient({
      baseUrl: process.env.FEED_INTERNAL_BASE_URL ?? "",
      key, trace,
    });
    phase = "maintenance";
    const maintenanceStarted = performance.now();
    // Cleanup and recovery remain active when new publications are disabled.
    await core.maintenance(20);
    metric("maintenance", performance.now() - maintenanceStarted);
    const worker = createFeedCloudWorker({
      core,
      objects: createFeedCloudObjects(process.env, trace),
      engine: sharpFeedEngine,
      trace,
    });
    phase = "claim";
    const claimStarted = performance.now();
    const jobs = await core.claimJobs(1, workerType);
    metric("claim", performance.now() - claimStarted);
    console.log(JSON.stringify({ event: "feed_invocation_claim", trace, workerType,
      jobCount: jobs.length, jobs: jobs.map(job => ({ jobId: job.id, attempt: job.attempts,
        kind: job.kind, declaredBytes: job.sourceBytes ?? null })) }));
    phase = "process";
    for (const job of jobs) await worker.process(job);
    metric("total", performance.now() - started);
    return jobs.length;
  } catch (error) {
    console.error(JSON.stringify({ event: "feed_invocation_failure", stage: phase,
      workerType, trace, durationMs: Math.round(performance.now() - started),
      ...classifyFeedFailure("INVOCATION_" + phase, error) }));
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
