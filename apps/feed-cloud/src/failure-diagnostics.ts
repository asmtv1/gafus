/** Safe, bounded classifications for durable FeedStorageJob.errorCode and structured logs.
 * Never persist Error.message, stack, S3 keys/URLs, provider response bodies or credentials.
 */
export function classifyFeedFailure(stage: string, error: unknown) {
  const item = error && typeof error === "object"
    ? error as { code?: unknown; name?: unknown; message?: unknown; status?: unknown;
        $metadata?: { httpStatusCode?: unknown }; exitCode?: unknown; reason?: unknown }
    : {};
  const httpStatus = typeof item.$metadata?.httpStatusCode === "number"
    ? item.$metadata.httpStatusCode
    : typeof item.status === "number" ? item.status : undefined;
  const value = (...values: unknown[]) => values.find(
    entry => typeof entry === "string" && entry.length > 0,
  ) as string | undefined;
  const rawCode = value(item.code, item.name);
  // Only explicitly allowlisted classifications can enter persisted error codes.
  const known: Record<string, string> = {
    AccessDenied: "S3_ACCESS_DENIED", Forbidden: "S3_ACCESS_DENIED",
    NoSuchKey: "S3_NOT_FOUND", NotFound: "S3_NOT_FOUND",
    PreconditionFailed: "S3_ETAG_MISMATCH",
    AbortError: "ABORTED", TimeoutError: "TIMEOUT",
    ETIMEDOUT: "NETWORK_TIMEOUT", ECONNRESET: "NETWORK_RESET",
    ECONNREFUSED: "NETWORK_REFUSED", ENOTFOUND: "NETWORK_DNS",
    EAI_AGAIN: "NETWORK_DNS", EACCES: "FILE_ACCESS",
    ENOENT: "FILE_NOT_FOUND", ENOSPC: "FILE_NO_SPACE",
    EROFS: "FILE_READ_ONLY", EEXIST: "FILE_EXISTS",
  };
  const safeMessages = new Set([
    "SOURCE_CHANGED", "SOURCE_SIZE", "SOURCE_WRITE_FAILED",
    "INVALID_SOURCE_LIMIT", "INVALID_FEED_STORAGE_CONFIG",
    "INVALID_FEED_STORAGE_ENDPOINT", "UNTRUSTED_CLAIM", "LEASE_EXPIRED",
    "OUTPUT_SIZE", "IMMUTABLE_CONFLICT", "ALBUM_STORAGE_UNAVAILABLE",
    "INVALID_FEED_FLAG", "INVALID_PUBLIC_FEED_BUCKET",
    "VIDEO_TOO_LONG", "VIDEO_STREAM_MISSING", "VIDEO_SIZE",
    "VIDEO_DURATION_UNKNOWN", "VIDEO_DECODE_FAILED", "VIDEO_TIMELINE_INVALID",
    "VIDEO_PLAYLIST", "VIDEO_SEGMENT_PATH", "VIDEO_SEGMENT_SIZE",
    "VIDEO_SEGMENT_LIST", "VIDEO_PATH", "VIDEO_FFMPEG_FAILED",
    "VIDEO_PROCESS_ABORTED", "VIDEO_PROCESS_TIMEOUT", "VIDEO_PROCESS_OUTPUT_LIMIT",
    "VIDEO_PROCESS_FAILED", "VIDEO_SOURCE_NOT_FILE", "VIDEO_PROBE_FAILED",
    "VIDEO_PLAYLIST_DURATION", "VIDEO_PLAYLIST_SIZE", "VIDEO_SEGMENT_MISSING",
    "VIDEO_POSTER_SIZE", "VIDEO_OUTPUT_DIMENSIONS",
    "FEED_INTERNAL_REQUEST_TOO_LARGE", "FEED_INTERNAL_RESPONSE_INVALID",
    "FEED_INTERNAL_UNREACHABLE", "FEED_INTERNAL_RESPONSE_TOO_LARGE",
    "FEED_INTERNAL_EMPTY_RESPONSE", "INVALID_FEED_INTERNAL_CONFIG",
    "INVALID_FEED_WORKER_TYPE",
  ]);
  const rawMessage = typeof item.message === "string" ? item.message : "";
  const native = value(item.code, item.message);
  let reason = safeMessages.has(native ?? "") ? native!
    : rawCode && Object.hasOwn(known, rawCode) ? known[rawCode]
    : rawCode === "FeedInternalHttpError" && typeof httpStatus === "number"
      ? "CORE_HTTP_" + httpStatus
    : rawCode === "FeedInternalHttpError" ? "CORE_HTTP_ERROR"
    : typeof httpStatus === "number" && httpStatus >= 400 && httpStatus <= 599
      ? "HTTP_" + httpStatus
    : "UNKNOWN";
  if (reason === "UNKNOWN" && safeMessages.has(rawMessage)) reason = rawMessage;
  const prefix = stage.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 32) || "UNCLASSIFIED";
  const errorCode = (prefix + "_" + reason).slice(0, 64);
  return {
    errorCode,
    category: reason,
    ...(typeof httpStatus === "number" && httpStatus >= 400 && httpStatus <= 599
      ? { httpStatus } : {}),
    ...(typeof item.exitCode === "number" ? { exitCode: item.exitCode } : {}),
    ...(typeof item.reason === "string" && /^[A-Z_]{1,32}$/.test(item.reason)
      ? { reason: item.reason } : {}),
  };
}
