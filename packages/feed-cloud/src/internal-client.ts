import { signFeedRequest, type FeedInternalPath } from "./hmac.js";

export interface FeedCloudJob {
  id: string;
  attemptToken: string;
  kind: "copy_album" | "publish_photo" | "publish_video" | "delete_keys" | "cleanup_source";
  ownerId: string;
  postId: string | null;
  uploadId: string | null;
  mediaId: string | null;
  sourceKeys: string[];
  targetKeys: string[];
  attempts: number;
  leaseUntil?: string;
  sourceETag?: string;
  sourceBytes?: number;
}
/** Non-secret execution correlation. Provider executionId is optional, never guessed. */
export interface FeedWorkerTrace {
  invocationId: string;
  jobName?: string;
  executionId?: string;
  hostId?: string;
}
export interface FeedCloudOutput {
  width: number;
  height: number;
  durationSeconds?: number;
  thumbKey?: string;
  fullKey?: string;
  posterKey?: string;
  playlistKey?: string;
  videoSegmentKeys?: string[];
}
export class FeedInternalHttpError extends Error {
  constructor(public readonly status: number) {
    super("FEED_INTERNAL_HTTP_ERROR");
    this.name = "FeedInternalHttpError";
  }
}
export interface FeedCloudInternalClient {
  claimJobs(batchSize: number, workerType?: "photo" | "video"): Promise<FeedCloudJob[]>;
  completeJob(id: string, attemptToken: string, output?: FeedCloudOutput): Promise<{ accepted: boolean }>;
  failJob(id: string, attemptToken: string, code?: string): Promise<{ accepted: boolean }>;
  renewJob(id: string, attemptToken: string): Promise<{ accepted: boolean }>;
  maintenance(batchSize: number): Promise<unknown>;
}
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_REQUEST_BYTES = 16 * 1024;
async function readBounded(response: Response): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error("FEED_INTERNAL_RESPONSE_TOO_LARGE");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("FEED_INTERNAL_EMPTY_RESPONSE");
  const chunks: Uint8Array[] = [];
  let count = 0;
  try {
    while (true) {
      const packet = await reader.read();
      if (packet.done) break;
      count += packet.value.byteLength;
      if (count > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("FEED_INTERNAL_RESPONSE_TOO_LARGE");
      }
      chunks.push(packet.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}
function assertBatchSize(size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > 20) throw new Error("FEED_BATCH_SIZE");
}
function acceptedResult(value: unknown): { accepted: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    typeof (value as { accepted?: unknown }).accepted !== "boolean") {
    throw new Error("FEED_INTERNAL_RESPONSE_INVALID");
  }
  return { accepted: (value as { accepted: boolean }).accepted };
}
/**
 * Worker-side transport only. The signing key is injected at runtime, not stored
 * in this package or passed through any public feed DTO.
 */
export function createFeedCloudInternalClient(input: {
  baseUrl: string;
  key: Uint8Array;
  fetcher?: typeof fetch;
  trace?: FeedWorkerTrace;
}): FeedCloudInternalClient {
  const origin = new URL(input.baseUrl);
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash ||
      origin.username || origin.password || origin.port || input.key.byteLength < 32) {
    throw new Error("INVALID_FEED_INTERNAL_CONFIG");
  }
  const request = async (path: FeedInternalPath, payload: object): Promise<unknown> => {
    const fetcher = input.fetcher ?? fetch;
    // During rolling deployments a newly built Worker may start before the Core API
    // accepts the additive trace field. Re-sign once without trace on HTTP 400.
    // Domain validation still fails closed; no unverified response is accepted.
    const hasTrace = input.trace !== undefined && "trace" in payload;
    let legacyFallback = false;
    let retryCount = 0;
    for (;;) {
      const body = JSON.stringify(legacyFallback
        ? { ...payload, trace: undefined } : payload);
      if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) throw new Error("FEED_INTERNAL_REQUEST_TOO_LARGE");
      try {
        const headers = {
          "content-type": "application/json",
          ...signFeedRequest({ path, body, key: input.key }),
        };
        const response = await fetcher(origin.origin + path, {
          method: "POST", body, headers, redirect: "error",
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
          await response.body?.cancel();
          if (hasTrace && !legacyFallback && response.status === 400) {
            legacyFallback = true;
            console.warn(JSON.stringify({
              event: "feed_internal_trace_compatibility_retry",
              path, invocationId: input.trace?.invocationId,
            }));
            continue;
          }
          throw new FeedInternalHttpError(response.status);
        }
        return await readBounded(response);
      } catch (error) {
        const retryable = !(error instanceof FeedInternalHttpError) ||
          error.status === 429 || error.status >= 500;
        if (!retryable || retryCount >= 1) throw error;
        retryCount++;
      }
    }
  };
  return {
    async claimJobs(batchSize, workerType) {
      assertBatchSize(batchSize);
      const result = await request("/internal/feed/jobs/claim", { batchSize, ...(workerType ? { workerType } : {}), ...(input.trace ? { trace: input.trace } : {}) });
      if (!Array.isArray(result) || result.length > batchSize ||
          result.some(job => !job || typeof job !== "object" ||
            typeof job.id !== "string" || typeof job.attemptToken !== "string" ||
            typeof job.kind !== "string" || !Array.isArray(job.sourceKeys))) {
        throw new Error("FEED_INTERNAL_RESPONSE_INVALID");
      }
      return result as FeedCloudJob[];
    },
    async completeJob(jobId, attemptToken, output) {
      return acceptedResult(await request("/internal/feed/jobs/complete",
        { jobId, attemptToken, ...(output ? { output } : {}), ...(input.trace ? { trace: input.trace } : {}) }));
    },
    async failJob(jobId, attemptToken, code) {
      return acceptedResult(await request("/internal/feed/jobs/fail",
        { jobId, attemptToken, ...(code ? { code } : {}), ...(input.trace ? { trace: input.trace } : {}) }));
    },
    async renewJob(jobId, attemptToken) {
      return acceptedResult(await request("/internal/feed/jobs/renew", { jobId, attemptToken, ...(input.trace ? { trace: input.trace } : {}) }));
    },
    async maintenance(batchSize) {
      assertBatchSize(batchSize);
      return request("/internal/feed/maintenance", { batchSize });
    },
  };
}
