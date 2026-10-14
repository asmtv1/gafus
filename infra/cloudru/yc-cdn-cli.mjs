import { spawnSync } from "node:child_process";

const transientCodes = new Set([
  "DeadlineExceeded",
  "Unavailable",
  "ResourceExhausted",
  "ETIMEDOUT",
  "ECONNRESET",
  "EAI_AGAIN",
]);
const knownCodes = [
  "PERMISSION_DENIED",
  "UNAUTHENTICATED",
  "PermissionDenied",
  "Unauthenticated",
  ...transientCodes,
  "ENOENT",
];
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function errorCode(result) {
  // Never expose raw CLI output: it may contain CDN signing/header secrets.
  const diagnostic = (result.stderr ?? "") + " " + (result.error?.code ?? "");
  const apiCode = diagnostic.match(/code\s*=\s*([A-Za-z_]+)/)?.[1];
  if (apiCode && knownCodes.includes(apiCode)) return apiCode;
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
    if (attempt < maxAttempts && transientCodes.has(code)) {
      warn(`YC_CDN_READ_RETRY_${operation}_${code}_ATTEMPT_${attempt}_OF_${maxAttempts}`);
      wait(Math.min(1000 * 2 ** (attempt - 1), 4000));
      continue;
    }
    throw Error(`YC_CDN_COMMAND_FAILED_${operation}_${code}_EXIT_${result.status}`);
  }
}
