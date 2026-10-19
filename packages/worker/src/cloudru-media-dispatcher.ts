/**
 * Trigger Cloud.ru Container Jobs every minute while local GAFUS Worker is healthy.
 * Core owns all durable claims/leases; overlapping Cloud invocations are idempotent.
 * No schedule is installed unless CLOUDRU_MEDIA_JOBS_ENABLED=true.
 */
const DEFAULT_MEDIA_JOB_NAMES = [
  "gafus-gallery-process",
  "gafus-feed-photo",
  "gafus-feed-video",
] as const;
export const CLOUDRU_FEED_JOB_POOLS = {
  photo: ["gafus-feed-photo", "gafus-feed-photo-2"],
  video: ["gafus-feed-video", "gafus-feed-video-2"],
} as const;
export const CLOUDRU_MEDIA_JOB_NAMES = [
  ...DEFAULT_MEDIA_JOB_NAMES,
  "gafus-feed-photo-2",
  "gafus-feed-video-2",
  "gafus-questions-photo",
] as const;

export type CloudruMediaJobName = (typeof CLOUDRU_MEDIA_JOB_NAMES)[number];
type HttpFetch = typeof fetch;
export function createCloudruMediaDispatcher(
  env: Record<string, string | undefined> = process.env,
  http: HttpFetch = fetch,
  names: readonly CloudruMediaJobName[] = DEFAULT_MEDIA_JOB_NAMES,
) {
  if (env.CLOUDRU_MEDIA_JOBS_ENABLED !== "true")
    return async () => ({ disabled: true, dispatched: 0 });
  if (
    !/^[a-f0-9-]{32,40}$/.test(env.CLOUDRU_PROJECT_ID ?? "") ||
    !env.CLOUDRU_KEY_ID ||
    !env.CLOUDRU_KEY_SECRET ||
    (names.some((name) => name.startsWith("gafus-feed")) && env.FEED_PROCESSOR_READY !== "true") ||
    (names.includes("gafus-gallery-process") && env.GALLERY_PROCESSOR_READY !== "true") ||
    (names.includes("gafus-questions-photo") &&
      (env.QUESTIONS_PROCESSOR_READY !== "true" ||
        env.QUESTIONS_CLOUD_JOB_ENABLED !== "true")) ||
    names.length === 0 ||
    names.some((name) => !CLOUDRU_MEDIA_JOB_NAMES.includes(name))
  ) {
    throw Error("CLOUDRU_MEDIA_DISPATCHER_UNSAFE_CONFIGURATION");
  }
  let running = false;
  const emit = (phase: "iam" | "execute", durationMs: number, name?: CloudruMediaJobName,
    httpStatus?: number) => {
    // Job names are fixed allowlisted values; never log tokens, payloads or URLs.
    console.log(JSON.stringify({event: "cloudru_media_dispatch", phase, ...(name ? {job: name} : {}),
      durationMs: Math.round(durationMs),
      ...(httpStatus ? {httpStatus} : {}),
    }));
  };
  let cachedToken: string | undefined;
  let tokenExpires = 0;
  return async () => {
    if (running) return { skipped: true, dispatched: 0 };
    running = true;
    let dispatched = 0;
    try {
      if (!cachedToken || Date.now() > tokenExpires) {
        const authStart = performance.now();
        const login = await http("https://iam.api.cloud.ru/api/v1/auth/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ keyId: env.CLOUDRU_KEY_ID, secret: env.CLOUDRU_KEY_SECRET }),
          signal: AbortSignal.timeout(12000),
        });
        emit("iam", performance.now() - authStart, undefined, login.status);
        if (!login.ok) throw Error("CLOUDRU_JOB_IAM_UNAVAILABLE");
        const json = (await login.json()) as { access_token?: string };
        if (!json.access_token) throw Error("CLOUDRU_JOB_IAM_NO_TOKEN");
        cachedToken = json.access_token;
        tokenExpires = Date.now() + 4 * 60_000;
      }
      for (const name of names) {
        const dispatchStart = performance.now();
        const result = await http("https://containers.api.cloud.ru/v2/jobs/" + name + ":execute", {
          method: "POST",
          headers: { authorization: "Bearer " + cachedToken, "content-type": "application/json" },
          body: JSON.stringify({ projectId: env.CLOUDRU_PROJECT_ID, jobName: name, params: {} }),
          signal: AbortSignal.timeout(18000),
        });
        emit("execute", performance.now() - dispatchStart, name, result.status);
        if (!result.ok) {
          if ([401, 403].includes(result.status)) {
            cachedToken = undefined;
            tokenExpires = 0;
          }
          throw Error("CLOUDRU_JOB_EXECUTION_FAILED_" + name + "_" + result.status);
        }
        dispatched++;
      }
      return { dispatched };
    } finally {
      running = false;
    }
  };
}

/** One accepted launch per upload, alternating Jobs sharing Core's durable queue.
 * Advance before awaiting so retries also try the other Job after rejection.
 * Recovery polling keeps its three existing launches; idle cost is unchanged.
 */
export function createCloudruFeedPoolDispatcher(
  kind: keyof typeof CLOUDRU_FEED_JOB_POOLS,
  env: Record<string, string | undefined> = process.env,
  http: HttpFetch = fetch,
) {
  const dispatchers = CLOUDRU_FEED_JOB_POOLS[kind].map((name) =>
    createCloudruMediaDispatcher(env, http, [name]),
  );
  let next = 0;
  return () => {
    const dispatch = dispatchers[next]!;
    next = (next + 1) % dispatchers.length;
    return dispatch();
  };
}
