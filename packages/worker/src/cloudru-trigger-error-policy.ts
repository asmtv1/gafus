import { UnrecoverableError } from "bullmq";
import { safeCloudruDispatchError } from "./cloudru-media-dispatcher.js";

/** Cloud.ru :execute is a NON-idempotent POST. A lost network ACK or 5xx
 * may mean the Cloud Job was already launched. BullMQ must NOT repeat this
 * wake in 3 seconds under its default retry policy; the authoritative DB
 * lease/eligible-task recovery scans it later. Transient IAM errors (before
 * execute) and explicit provider 429 rejection remain safely retryable;
 * permanent IAM 401/403 and execute 4xx are terminal for this wake.
 */
export function safeCloudruWakeFailure(error: unknown): Error {
  const sanitized = safeCloudruDispatchError(error);
  const code = sanitized.message;
  const unknownExecutionAck =
    /^CLOUDRU_JOB_EXECUTION_NETWORK_(?:EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|TIMEOUT|UNAVAILABLE)$/.test(code) ||
    /^CLOUDRU_JOB_EXECUTION_FAILED_gafus-(?:feed|chat)-video(?:-2)?_(?:408|5\d\d)$/.test(code);
  // A definite provider rejection with a permanent status cannot become
  // successful after repeating the identical wake. Authentication and ACL
  // failures also require operator intervention, not another Cloud Job POST.
  if (/^CLOUDRU_JOB_IAM_UNAVAILABLE_(?:401|403)$/.test(code)) {
    return new UnrecoverableError("CLOUDRU_JOB_IAM_AUTH_REJECTED");
  }
  const permanentExecutionRejection =
    /^CLOUDRU_JOB_EXECUTION_FAILED_gafus-(?:feed|chat)-video(?:-2)?_(?:400|401|403|404|410|422)$/.test(code);
  if (permanentExecutionRejection) {
    return new UnrecoverableError("CLOUDRU_JOB_EXECUTION_PERMANENT_REJECTION");
  }
  if (unknownExecutionAck) {
    // BullMQ UnrecoverableError terminates ONLY this immediate wake job, not
    // the SQL media task. Never log raw provider payloads, endpoint or secrets.
    return new UnrecoverableError("CLOUDRU_JOB_EXECUTION_ACK_UNKNOWN");
  }
  return sanitized;
}
