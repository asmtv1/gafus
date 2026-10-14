import { spawnSync } from "node:child_process";

// Classify errors without ever printing raw CLI output, which can contain
// private CDN signing keys and request-header secrets.
const transientCodes = new Set([
  "DeadlineExceeded",
  "Unavailable",
  "ResourceExhausted",
  "Internal",
  "Aborted",
  "ETIMEDOUT",
  "ECONNRESET",
  "EAI_AGAIN",
  "HTTP_429",
  "HTTP_500",
  "HTTP_502",
  "HTTP_503",
  "HTTP_504",
]);
const permanentCodes = new Set([
  "PERMISSION_DENIED",
  "UNAUTHENTICATED",
  "PermissionDenied",
  "Unauthenticated",
  "InvalidArgument",
  "FailedPrecondition",
  "NotFound",
  "AlreadyExists",
  "ENOENT",
  "EACCES",
  "EPERM",
  "HTTP_400",
  "HTTP_401",
  "HTTP_403",
  "HTTP_404",
]);
const knownCodes = [...permanentCodes, ...transientCodes];
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function errorCode(result) {
  // CLI errors can contain customer secrets: return only whitelisted codes.
  const diagnostic = (result.stderr ?? "") + " " + (result.error?.code ?? "");
  const apiCode = diagnostic.match(/code\s*=\s*([A-Za-z_]+)/)?.[1];
  if (apiCode && knownCodes.includes(apiCode)) return apiCode;
  const httpStatus = diagnostic.match(
    /(?:HTTP\/?\d*|status(?:\s+code)?|response\s+code)\s*[:= ]\s*(400|401|403|404|429|500|502|503|504)\b/i,
  )?.[1];
  if (httpStatus) return `HTTP_${httpStatus}`;
  if (
    /\b(401\s+Unauthorized|403\s+Forbidden|429\s+Too Many Requests|502\s+Bad Gateway|503\s+Service Unavailable|504\s+Gateway Timeout)\b/i.test(
      diagnostic,
    )
  ) {
    const status = diagnostic.match(
      /\b(401|403|429|502|503|504)\s+(?:Unauthorized|Forbidden|Too Many Requests|Bad Gateway|Service Unavailable|Gateway Timeout)\b/i,
    )?.[1];
    if (status) return `HTTP_${status}`;
  }
  return knownCodes.find((code) => diagnostic.includes(code)) ?? "UNKNOWN";
}

export function runYcCdn(args, { run = spawnSync, wait = sleep, warn = console.warn } = {}) {
  // A timed-out mutation can have succeeded remotely: never retry it blindly.
  const readOnly = args[0] === "cdn" && ["get", "list"].includes(args[2]);
  const maxAttempts = readOnly ? 4 : 1;
  const operation = args.slice(0, 2).join("_");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = run("yc", [...args, "--format=json"], {
      encoding: "utf8",
      timeout: 55000,
      maxBuffer: 3 * 1024 * 1024,
    });
    if (result.status === 0) return result.stdout?.trim() ? JSON.parse(result.stdout) : {};

    const code = errorCode(result);
    // An unclassified CLI failure is safe to retry ONLY for read-only CDN
    // lookups. Any persistent failure still blocks the release after 4 tries.
    // Mutations are never retried because the remote write may have succeeded.
    const mayRetry =
      readOnly && !permanentCodes.has(code) && (transientCodes.has(code) || code === "UNKNOWN");
    if (attempt < maxAttempts && mayRetry) {
      warn(`YC_CDN_READ_RETRY_${operation}_${code}_ATTEMPT_${attempt}_OF_${maxAttempts}`);
      wait(Math.min(1000 * 2 ** (attempt - 1), 4000));
      continue;
    }
    throw Error(`YC_CDN_COMMAND_FAILED_${operation}_${code}_EXIT_${result.status}`);
  }
}
