import { createHash } from "node:crypto";

// API response semantics and signature validation at CDN cache HIT must be independently
// proven before enabling this adapter. Never silently substitute Yandex purge for Cloud.ru.
function config(scope: "gallery" | "feed", env = process.env) {
  const account = env.CLOUDRU_CDN_ACCOUNT_NAME ?? "";
  const token = env.CLOUDRU_CDN_API_TOKEN ?? "";
  const names = env[`${scope.toUpperCase()}_CLOUDRU_CDN_DOMAINS`] ?? "";
  const domains = [
    ...new Set(
      names
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];
  if (
    env.CLOUDRU_CDN_PURGE_API_VERIFIED !== "true" ||
    env.CLOUDRU_CDN_CACHE_KEY_VERIFIED !== "true" ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(account) ||
    token.length < 24 ||
    !domains.length ||
    domains.some((x) => !/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(x) || x.endsWith(".yandexcloud.net"))
  )
    throw new Error("CLOUDRU_CDN_PURGE_NOT_VERIFIED");
  return { account, token, domains };
}
async function request(
  account: string,
  token: string,
  method: "GET" | "POST",
  suffix: string,
  body?: object,
) {
  const url = `https://api.cdnvideo.ru/app/cache/v3/${encodeURIComponent(account)}/tasks${suffix}`;
  const response = await fetch(url, {
    method,
    headers: {
      "cdn-auth-token": token,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  // An expired/failed provider task must be resubmitted; retries keep a
  // checkpoint only for in-flight or successfully completed submissions.
  if (response.status === 404 && method === "GET") throw new Error("CLEANUP_CDN_OPERATION_FAILED");
  if (!response.ok) throw new Error(`CLOUDRU_CDN_HTTP_${response.status}`);
  // Never log raw API responses or tokens, even on invalid schema.
  return (await response.json()) as Record<string, unknown>;
}
const taskPattern = /^[A-Za-z0-9_-]{1,128}$/;
export async function beginCloudruCdnPurge(
  scope: "gallery" | "feed",
  paths: string[],
  existing: string[],
  checkpoint?: (operations: string[]) => Promise<void>,
) {
  const { account, token, domains } = config(scope);
  if (
    !paths.length ||
    paths.some(
      (path) => !/^\/[A-Za-z0-9_./-]+$/.test(path) || path.includes("..") || path.includes("*"),
    )
  )
    throw new Error("CLOUDRU_CDN_UNSAFE_PATH");
  const operations = [...existing];
  // CDNvideo documents max 10 API calls/minute per account. Keep a buffer for
  // status polling and other workers; a checkpointed retry resumes next minute.
  let submitted = 0;
  for (const domain of domains)
    for (let i = 0; i < paths.length; i += 10) {
      const batch = paths.slice(i, i + 10);
      const hash = createHash("sha256")
        .update(JSON.stringify({ domain, paths: batch }))
        .digest("hex");
      if (operations.some((op) => op.replace(/^done:/, "").startsWith(`cloudru:${hash}:`)))
        continue;
      if (submitted >= 6) throw new Error("CLEANUP_CDN_RATE_LIMIT");
      const result = await request(account, token, "POST", "", {
        domain,
        action: "delete",
        action_type: "single",
        paths: batch,
      });
      const id = result.task_id;
      if (typeof id !== "string" || !taskPattern.test(id))
        throw new Error("CLOUDRU_CDN_UNKNOWN_RESPONSE");
      operations.push(`cloudru:${hash}:${id}`);
      submitted++;
      await checkpoint?.(operations);
    }
  return operations;
}
export async function cloudruCdnPurgeDone(operation: string): Promise<boolean> {
  const match = /^cloudru:[a-f0-9]{64}:([A-Za-z0-9_-]{1,128})$/.exec(operation);
  if (!match) throw new Error("CLOUDRU_CDN_UNSAFE_OPERATION");
  const account = process.env.CLOUDRU_CDN_ACCOUNT_NAME ?? "";
  const token = process.env.CLOUDRU_CDN_API_TOKEN ?? "";
  if (
    process.env.CLOUDRU_CDN_PURGE_API_VERIFIED !== "true" ||
    process.env.CLOUDRU_CDN_CACHE_KEY_VERIFIED !== "true" ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(account) ||
    token.length < 24
  )
    throw new Error("CLOUDRU_CDN_PURGE_NOT_VERIFIED");
  const result = await request(account, token, "GET", `/${match[1]}`);
  if (result.status === "failed" || result.error) throw new Error("CLEANUP_CDN_OPERATION_FAILED");
  if (result.status === "ok") {
    // The provider reports per-path cache purge success percentages. A task
    // marked `ok` with a partial result is NOT an audited full purge.
    if (
      (Array.isArray(result.rate) && result.rate.some((x) => typeof x !== "number" || x < 100)) ||
      (Array.isArray(result.cnc_rate) &&
        result.cnc_rate.some((x) => typeof x !== "number" || x < 100))
    )
      throw new Error("CLEANUP_CDN_OPERATION_FAILED");
    return true;
  }
  if (result.status === "in_queue" || result.status === "processing") return false;
  throw new Error("CLOUDRU_CDN_UNKNOWN_RESPONSE");
}
