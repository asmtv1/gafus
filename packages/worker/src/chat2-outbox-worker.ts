import {
  prepareChat2PushReceipt, readChat2OutboxMetrics, readDueChat2Outbox,
  quarantineExhaustedChat2Outbox, claimChat2Outbox, renewChat2OutboxClaim,
  acknowledgeChat2Outbox, failChat2Outbox,
} from "@gafus/notifications-server/chat2-outbox-rows";
import {
  prepareChat2V2MediaDeletion, completeChat2V2MediaDeletion, readDeletedChat2Attachments,
  markChat2AttachmentRemoving, completeChat2AttachmentDeletion, readDueChat2DeletionIntents,
  claimChat2DeletionIntent, readLiveChat2Media, acknowledgeChat2DeletionIntent,
  retryChat2DeletionIntent, pruneChat2CompletedMediaIntentsOnce,
} from "@gafus/media-server/chat2-deletion-rows";
export { pruneChat2CompletedMediaIntentsOnce };
/** Chat 2.0 durable outbox: no Stream webhooks, only successful PostgreSQL writes. */
import { randomUUID } from "node:crypto";
import {
  classifyJobError,
  nextJobAttemptDelay,
  MAX_CHAT2_OUTBOX_ATTEMPTS,
} from "./reliable-job-policy.js";
import { createWorkerLogger } from "@gafus/logger";
import {
  configureServerTelemetry,
  startCorrelatedSpan,
  withServerSpan,
  markServerSpanError,
} from "@gafus/logger/server-telemetry";
import {
  renderChat2OutboxMetricsPrometheus,
  chat2OutboxExecutionMetrics,
  type Chat2OutboxOutcome,
  type Chat2OutboxFailureClass,
} from "./chat2-outbox-metrics.js";
import { traceChat2DispatchStage, chat2DispatchTiming } from "./chat2-outbox-tracing.js";
import { pushQueue } from "@gafus/queues";
import { chat2DeletePrivateMedia, chat2V2DeleteObjects } from "@gafus/cdn-upload";
import {
  recordChat2PollSuccess,
  resetChat2PollReadiness,
  probeChat2BrokerAuth,
  chat2BrokerPublishUrl,
} from "./chat2-readiness";


const outboxLog = createWorkerLogger("chat2-outbox");
configureServerTelemetry("gafus-worker");

async function publish(
  channel: string,
  eventId: string,
  eventType: string,
  messageId: string | null,
) {
  const address = process.env.CHAT2_CENTRIFUGO_HTTP_API;
  const key = process.env.CHAT2_CENTRIFUGO_API_KEY;
  if (!address || !key) throw new Error("CHAT2_CENTRIFUGO_NOT_CONFIGURED");
  const u = chat2BrokerPublishUrl(address);
  if (!u) throw new Error("CHAT2_UNSAFE_REALTIME_ENDPOINT");
  const response = await fetch(u, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(4000),
    headers: { "Content-Type": "application/json", "X-API-Key": key },
    body: JSON.stringify({ channel, data: { eventId, eventType, messageId } }),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error("CHAT2_BROKER_AUTH_DENIED");
    if (response.status === 400 || response.status === 404)
      throw new Error("CHAT2_BROKER_BAD_REQUEST");
    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : NaN;
      const until =
        retryAfter && !Number.isFinite(seconds) ? Date.parse(retryAfter) - Date.now() : NaN;
      const retryAfterMs = Number.isFinite(seconds) ? seconds * 1000 : until;
      const failure = new Error("CHAT2_CENTRIFUGO_RATE_LIMITED");
      if (Number.isFinite(retryAfterMs))
        Object.assign(failure, { retryAfterMs: Math.min(3_600_000, Math.max(0, retryAfterMs)) });
      throw failure;
    }
    throw new Error("CHAT2_CENTRIFUGO_PUBLISH_FAILED");
  }
  const ack = (await response.json()) as { error?: unknown };
  if (ack.error) throw new Error("CHAT2_CENTRIFUGO_PUBLISH_REJECTED");
}

async function enqueueChatPush(conversationId: string, messageId: string) {
  const notificationId = await prepareChat2PushReceipt(
    conversationId, messageId, process.env.CYNOLOGIST_CHAT_TRAINER_USER_ID ?? null,
  );
  if (notificationId)
    await pushQueue.add(
      "push",
      { notificationId: notificationId },
      {
        jobId: notificationId,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: { count: 10000 },
      },
    );
}

/** Durable, retryable S3 cleanup only for messages explicitly soft-deleted by their owner.
 * The S3 helper itself rejects any non-isolated/prod environment.
 * The database keeps a REMOVING tombstone until the object delete succeeds.
 */
/** Separate S3 bucket for Media V2, still cleaned by the existing durable
 * Chat2 outbox worker. No VM, new queue or untracked direct-delete request.
 * All six keys are server-derived from the persisted reservation identity.
 */
async function deleteChat2MediaObject(key: string): Promise<void> {
  if (!key.startsWith("chat2-v2:")) {
    await chat2DeletePrivateMedia(key);
    return;
  }
  const mediaId = key.slice("chat2-v2:".length);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mediaId))
    throw Error("CHAT2_V2_DELETE_INVALID_MARKER");
  const { sourceKey, finalBase } = await prepareChat2V2MediaDeletion(mediaId);
  await chat2V2DeleteObjects([
    sourceKey,
    finalBase + "image/s.webp",
    finalBase + "image/m.webp",
    finalBase + "poster.webp",
    finalBase + "video/360.mp4",
    finalBase + "video/720.mp4",
  ]);
  await completeChat2V2MediaDeletion(mediaId);
}

async function purgeDeletedChat2Attachments(conversationId: string, messageId: string) {
  const media = await readDeletedChat2Attachments(conversationId, messageId);
  for (const item of media) {
    await markChat2AttachmentRemoving(item.id, messageId);
    await deleteChat2MediaObject(item.objectKey);
    await completeChat2AttachmentDeletion(item, messageId);
  }
}

export async function chat2OutboxMetricsSnapshot(now = new Date()): Promise<string> {
  return renderChat2OutboxMetricsPrometheus(await readChat2OutboxMetrics(now), now);
}

export async function processChat2OutboxOnce(limit = 20) {
  const now = new Date();
  const items = await readDueChat2Outbox(now, limit);
  let delivered = 0,
    failed = 0,
    deadLettered = 0;
  for (const item of items) {
    // Older rows which exhausted the pre-migration unbounded policy are
    // retained and quarantined; they are not silently discarded.
    if (item.attempts >= MAX_CHAT2_OUTBOX_ATTEMPTS) {
      const moved = await quarantineExhaustedChat2Outbox(item);
      deadLettered += moved.count;
      continue;
    }
    const until = new Date(Date.now() + 30_000);
    const claimToken = randomUUID();
    const claimed = await claimChat2Outbox(item, claimToken, until);
    if (!claimed.count) continue;
    const attemptStart = performance.now();
    let attemptOutcome: Chat2OutboxOutcome = "stale";
    let failureClass: Chat2OutboxFailureClass | undefined;
    const span = startCorrelatedSpan({
      name: "chat2.outbox.dispatch",
      service: "gafus-worker",
      kind: "consumer",
      traceId: item.traceId,
      operationId: item.operationId ?? item.id,
      attributes: { "gafus.job_attempt": item.attempts + 1, ...chat2DispatchTiming(item, Date.now()) },
    });
    // Long-running attachment deletion may exceed a single 30-second lease.
    // Renew only while the DB still recognizes this claimant. An older worker
    // cannot extend or ACK after another worker's fencing token took over.
    let lostLease = false;
    let renewing = false;
    const heartbeat = setInterval(() => {
      if (renewing) return;
      renewing = true;
      void renewChat2OutboxClaim(item.id, claimToken)
        .then((result) => {
          if (result.count !== 1) lostLease = true;
        })
        .catch(() => {
          lostLease = true;
        })
        .finally(() => {
          renewing = false;
        });
    }, 10_000);
    heartbeat.unref();
    try {
      await withServerSpan(span, async () => {
        if (item.eventType === "message.created" && item.messageId)
          await traceChat2DispatchStage("chat2.outbox.push", item.operationId ?? item.id, () =>
            enqueueChatPush(item.conversationId, item.messageId!),
          );
        if (item.eventType === "message.deleted" && item.messageId)
          await traceChat2DispatchStage(
            "chat2.outbox.media_cleanup",
            item.operationId ?? item.id,
            () => purgeDeletedChat2Attachments(item.conversationId, item.messageId!),
          );
        // If our heartbeat lost the lease, avoid a new external side effect.
        // Work already in flight may still be delivered at least once.
        if (lostLease) throw new Error("CHAT2_OUTBOX_CLAIM_LOST");
        // Stable eventId is the receiver's deduplication identity even across
        // crashes between external acknowledgement and this DB commit.
        await traceChat2DispatchStage("chat2.outbox.publish", item.operationId ?? item.id, () =>
          publish("chat2:" + item.conversationId, item.id, item.eventType, item.messageId),
        );
        const saved = await traceChat2DispatchStage(
          "chat2.outbox.ack",
          item.operationId ?? item.id,
          () =>
            acknowledgeChat2Outbox(item.id, claimToken),
        );
        delivered += saved.count;
        attemptOutcome = saved.count ? "delivered" : "stale";
      });
    } catch (error) {
      failed++;
      const failure = classifyJobError(error);
      markServerSpanError(span, failure.code);
      const exhausted = item.attempts + 1 >= MAX_CHAT2_OUTBOX_ATTEMPTS;
      const terminal = exhausted || !failure.retryable;
      failureClass = terminal ? "terminal" : "retryable";
      const saved = await failChat2Outbox(item.id, claimToken, failure.code, terminal,
        new Date(Date.now() + Math.max(nextJobAttemptDelay(item.attempts + 1), failure.retryAfterMs ?? 0)),
      );
      attemptOutcome = saved.count ? (terminal ? "dead_letter" : "retry") : "stale";
      if (terminal) {
        deadLettered += saved.count;
        if (saved.count)
          outboxLog.warn("chat2.outbox.dead_letter", {
            traceId: item.traceId,
            operationId: item.operationId ?? item.id,
            attempt: item.attempts + 1,
            errorCode: failure.code,
            eventType: item.eventType,
          });
      }
    } finally {
      chat2OutboxExecutionMetrics.record({
        outcome: attemptOutcome,
        failureClass,
        durationMs: performance.now() - attemptStart,
      });
      clearInterval(heartbeat);
      span.end();
    }
  }
  return { inspected: items.length, delivered, failed, deadLettered };
}
/** Independent of Chat2Media/User/Conversation cascades. An AFTER DELETE database
 * trigger creates this intent in the same transaction as deleting the row.
 * No raw S3 error, user details, or sensitive keys are logged.
 */
export async function processChat2MediaDeletionIntentsOnce(
  limit = 20,
  // Explicit one-key recovery/testing never touches unrelated pending uploads.
  onlyObjectKey?: string,
) {
  const now = new Date();
  const intents = await readDueChat2DeletionIntents(now, limit, onlyObjectKey);
  let deleted = 0;
  for (const intent of intents) {
    const lease = new Date(Date.now() + 45_000);
    const claimed = await claimChat2DeletionIntent(intent, lease);
    if (!claimed.count) continue;
    try {
      // Recovering a DB commit whose acknowledgement was lost: never delete
      // an S3 object while a live Chat2Media row still references its key.
      const liveMedia = await readLiveChat2Media(intent.objectKey);
      if (liveMedia) {
        await acknowledgeChat2DeletionIntent(intent, lease);
        continue;
      }
      await deleteChat2MediaObject(intent.objectKey);
      const saved = await acknowledgeChat2DeletionIntent(intent, lease);
      deleted += saved.count;
    } catch {
      await retryChat2DeletionIntent(intent, lease);
    }
  }
  return { inspected: intents.length, deleted };
}

/** Retain only recently completed cleanup receipts. Pending or leased work must
 * never be pruned. A future Chat2Media DELETE re-creates its intent atomically
 * through the PostgreSQL trigger even after the old DONE row was removed.
 */


/** Explicit opt-in. Never start a production worker from local ChatGPT operations. */
export function startChat2OutboxWorker() {
  if (process.env.CHAT2_WORKER_ENABLED !== "enabled") return () => undefined;
  let active = true,
    busy = false,
    lastPruneAt = 0;
  const tick = async () => {
    if (!active || busy) return;
    busy = true;
    try {
      try {
        const poll = await processChat2OutboxOnce();
        // Both a real DB poll and authenticated broker /api/info must work.
        // Failed delivery is not healthy merely because the broker /health is 200.
        if (poll.failed === 0 && (await probeChat2BrokerAuth())) recordChat2PollSuccess();
        else resetChat2PollReadiness();
      } catch {
        resetChat2PollReadiness();
        /* outbox retries independently of private media cleanup */
      }
      try {
        await processChat2MediaDeletionIntentsOnce();
      } catch {
        /* media cleanup remains durable, retry on next tick */
      }
      // Avoid rescanning DONE receipts on every two-second worker tick.
      if (Date.now() - lastPruneAt >= 60 * 60 * 1000) {
        lastPruneAt = Date.now();
        try {
          await pruneChat2CompletedMediaIntentsOnce();
        } catch {
          /* old DONE receipts can be pruned again on the next hourly pass */
        }
      }
    } finally {
      busy = false;
    }
  };
  void tick();
  const timer = setInterval(() => {
    void tick();
  }, 2000);
  timer.unref();
  return () => {
    active = false;
    resetChat2PollReadiness();
    clearInterval(timer);
  };
}
