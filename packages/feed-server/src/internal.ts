import { createFeedStorageFromEnv } from "@gafus/feed-storage";
import { z } from "zod";
import { FEED_LIMITS } from "@gafus/types";
import { createFeedRequestVerifier, type FeedNonceStore } from "@gafus/feed-cloud";
import { createFeedStorageJobs, createFeedMaintenance, createFeedUploadRecovery, FeedError } from "@gafus/core/services/feed";
import { createCurrentFeedInternalRuntime } from "@gafus/core/services/feed";
import { connection as redis } from "@gafus/queues";

export const FEED_INTERNAL_MAX_BODY_BYTES = 16_384;
const paths = new Set(["/internal/feed/jobs/claim", "/internal/feed/jobs/complete", "/internal/feed/jobs/fail", "/internal/feed/jobs/renew", "/internal/feed/maintenance"]);
const batch = z.object({ batchSize: z.number().int().min(1).max(20) }).strict();
// Trace is HMAC-authenticated with the command; it never includes object paths or secrets.
const trace = z.object({
  invocationId: z.string().uuid(),
  jobName: z.string().regex(/^gafus-feed-(photo|video)(-2)?$/).optional(),
  executionId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/).optional(),
  hostId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/).optional(),
}).strict();
const traced = { trace: trace.optional() };
const claimSchema = batch.extend({ workerType: z.enum(["photo", "video"]).optional(), ...traced });
const identity = { jobId: z.string().min(1).max(128), attemptToken: z.string().uuid() };
const output = z.object({
  width: z.number().int().positive(), height: z.number().int().positive(),
  durationSeconds: z.number().positive().max(FEED_LIMITS.videoSeconds).optional(),
  thumbKey: z.string().max(1024).optional(), fullKey: z.string().max(1024).optional(),
  posterKey: z.string().max(1024).optional(), playlistKey: z.string().max(1024).optional(),
  videoSegmentKeys: z.array(z.string().max(1024)).max(FEED_LIMITS.videoSeconds).optional(),
}).strict();
const completion = z.object({ ...identity, output: output.optional(), ...traced }).strict();
const renewal = z.object({ ...identity, ...traced }).strict();
const failure = z.object({ ...identity, code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).optional(), ...traced }).strict();
function audit(event: string, fields: Record<string, unknown>) {
  // HMAC-verified, schema-bounded data only. Never log signed headers, tokens or object keys.
  console.log(JSON.stringify({ event: "feed_internal_" + event, ...fields }));
}
const unavailable = () => new FeedError("FEED_DISABLED", "Внутренний API недоступен", 503);
const nonces: FeedNonceStore = {
  async consume(id, expiresAt) {
    if (expiresAt <= Date.now()) return false;
    if (redis.status !== "ready") throw unavailable();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        redis.set(`gafus-feed-nonce:${id}`, "1", "PXAT", expiresAt, "NX").then(result => result === "OK"),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(unavailable()), 1000); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  },
};
interface InternalDependencies {
  key: Uint8Array;
  nonces: FeedNonceStore;
  jobs: Pick<ReturnType<typeof createFeedStorageJobs>, "claim" | "complete" | "fail" | "renew">;
  maintenance: Pick<ReturnType<typeof createFeedMaintenance>, "run">;
  recovery?: { run(batchSize: number): Promise<{ recovered: number }> };
  now?: () => number;
}
/** Verify exact bounded bytes before decoding JSON or calling any domain service. */
export function createFeedInternalDispatcher(deps: InternalDependencies) {
  const verify = createFeedRequestVerifier(deps);
  return async (request: Request, path: string): Promise<unknown> => {
    const url = new URL(request.url);
    if (!paths.has(path) || url.pathname !== path || url.search)
      throw new FeedError("NOT_FOUND", undefined, 404);
    if (request.method !== "POST") throw new FeedError("VALIDATION_ERROR", "Ожидался POST", 405);
    if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json")
      throw new FeedError("VALIDATION_ERROR", "Ожидался JSON", 415);
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > FEED_INTERNAL_MAX_BODY_BYTES))
      throw new FeedError("VALIDATION_ERROR", "Слишком большой запрос", 413);
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = request.body?.getReader();
    try {
      if (reader) for (;;) {
        const packet = await reader.read();
        if (packet.done) break;
        size += packet.value.byteLength;
        if (size > FEED_INTERNAL_MAX_BODY_BYTES) {
          await reader.cancel();
          throw new FeedError("VALIDATION_ERROR", "Слишком большой запрос", 413);
        }
        chunks.push(packet.value);
      }
    } finally { reader?.releaseLock(); }
    const bytes = Buffer.concat(chunks);
    let valid: boolean;
    try {
      valid = await verify({ method: request.method, path, body: bytes, headers: {
        "x-feed-timestamp": request.headers.get("x-feed-timestamp") ?? undefined,
        "x-feed-nonce": request.headers.get("x-feed-nonce") ?? undefined,
        "x-feed-signature": request.headers.get("x-feed-signature") ?? undefined,
      } });
    } catch { throw unavailable(); }
    if (!valid) throw new FeedError("VALIDATION_ERROR", "Запрос не принят", 401);
    let body: unknown;
    try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw new FeedError("VALIDATION_ERROR", "Некорректный JSON", 400); }
    const schema = path.endsWith("/claim") ? claimSchema : path.endsWith("/renew") ? renewal : path.endsWith("/complete") ? completion : path.endsWith("/fail") ? failure : batch;
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new FeedError("VALIDATION_ERROR", "Некорректная команда", 400);
    if (path.endsWith("/renew")) {
      const data = renewal.parse(body);
      const result = await deps.jobs.renew(data.jobId, data.attemptToken);
      audit("renew", { jobId: data.jobId, trace: data.trace, accepted: result.accepted });
      return result;
    }
    if (path.endsWith("/claim")) {
      const data = claimSchema.parse(body);
      const result = data.workerType
        ? await deps.jobs.claim(data.batchSize, data.workerType)
        : await deps.jobs.claim(data.batchSize);
      audit("claim", { trace: data.trace, workerType: data.workerType, count: result.length,
        jobs: result.map(job => ({ jobId: job.id, kind: job.kind, attempt: job.attempts })) });
      return result;
    }
    if (path.endsWith("/complete")) {
      const data = completion.parse(body);
      const result = await deps.jobs.complete(data.jobId, data.attemptToken, data.output);
      audit("complete", { jobId: data.jobId, trace: data.trace, accepted: result.accepted,
        durationSeconds: data.output?.durationSeconds, segmentCount: data.output?.videoSegmentKeys?.length });
      return result;
    }
    if (path.endsWith("/fail")) {
      const data = failure.parse(body);
      const result = await deps.jobs.fail(data.jobId, data.attemptToken, data.code);
      audit("fail", { jobId: data.jobId, trace: data.trace,
        code: data.code ?? "MEDIA_PROCESSING_FAILED", accepted: result.accepted });
      return result;
    }
    // Cleanup deliberately continues when the public feed is disabled.
    const batchSize = batch.parse(body).batchSize;
    const cleanup = await deps.maintenance.run(batchSize);
    const recovery = await deps.recovery?.run(batchSize);
    return { ...cleanup, ...recovery };
  };
}
export async function dispatchFeedInternalRequest(request: Request, path: string): Promise<unknown> {
  const key = Buffer.from(process.env.FEED_INTERNAL_HMAC_SECRET ?? "", "utf8");
  if (key.byteLength < 32) throw unavailable();
  return createFeedInternalDispatcher({ key, nonces,
    ...createCurrentFeedInternalRuntime(createFeedStorageFromEnv()),
  })(request, path);
}
