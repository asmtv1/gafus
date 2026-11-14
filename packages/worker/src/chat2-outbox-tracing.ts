/** Only fixed, PII-free Chat2 outbox stage names/codes may reach telemetry.
 * These are child spans of the durable event's dispatch span and retain the
 * stored operationId through retry, lease takeover and crash recovery.
 */
import {
  markServerSpanError,
  startCorrelatedSpan,
  withServerSpan,
} from "@gafus/logger/server-telemetry";

export type Chat2DispatchStage =
  | "chat2.outbox.push"
  | "chat2.outbox.media_cleanup"
  | "chat2.outbox.publish"
  | "chat2.outbox.ack";

const errorCodes: Record<Chat2DispatchStage, string> = {
  "chat2.outbox.push": "CHAT2_PUSH_STAGE_FAILED",
  "chat2.outbox.media_cleanup": "CHAT2_MEDIA_STAGE_FAILED",
  "chat2.outbox.publish": "CHAT2_PUBLISH_STAGE_FAILED",
  "chat2.outbox.ack": "CHAT2_ACK_STAGE_FAILED",
};

export async function traceChat2DispatchStage<T>(
  stage: Chat2DispatchStage,
  operationId: string,
  action: () => Promise<T>,
): Promise<T> {
  const span = startCorrelatedSpan({
    service: "gafus-worker",
    name: stage,
    kind: stage === "chat2.outbox.publish" ? "client" : "internal",
    operationId,
    // Do not pass traceId: nested spans inherit the active dispatch context.
  });
  try {
    return await withServerSpan(span, action);
  } catch (error) {
    markServerSpanError(span, errorCodes[stage]);
    throw error;
  } finally {
    span.end();
  }
}
