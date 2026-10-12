/**
 * Trigger Cloud.ru Container Jobs every minute while local GAFUS Worker is healthy.
 * Core owns all durable claims/leases; overlapping Cloud invocations are idempotent.
 * No schedule is installed unless CLOUDRU_MEDIA_JOBS_ENABLED=true.
 */
export const CLOUDRU_MEDIA_JOB_NAMES = [
  "gafus-gallery-process",
  "gafus-feed-photo",
  "gafus-feed-video",
] as const;

type HttpFetch = typeof fetch;
export function createCloudruMediaDispatcher(
  env: Record<string, string | undefined> = process.env,
  http: HttpFetch = fetch,
) {
  if (env.CLOUDRU_MEDIA_JOBS_ENABLED !== "true")
    return async () => ({ disabled: true, dispatched: 0 });
  if (
    !/^[a-f0-9-]{32,40}$/.test(env.CLOUDRU_PROJECT_ID ?? "") ||
    !env.CLOUDRU_KEY_ID ||
    !env.CLOUDRU_KEY_SECRET ||
    env.FEED_PROCESSOR_READY !== "true" ||
    env.GALLERY_PROCESSOR_READY !== "true"
  ) {
    throw Error("CLOUDRU_MEDIA_DISPATCHER_UNSAFE_CONFIGURATION");
  }
  let running = false;
  let cachedToken: string | undefined;
  let tokenExpires = 0;
  return async () => {
    if (running) return { skipped: true, dispatched: 0 };
    running = true;
    let dispatched = 0;
    try {
      if (!cachedToken || Date.now() > tokenExpires) {
        const login = await http("https://iam.api.cloud.ru/api/v1/auth/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ keyId: env.CLOUDRU_KEY_ID, secret: env.CLOUDRU_KEY_SECRET }),
          signal: AbortSignal.timeout(12000),
        });
        if (!login.ok) throw Error("CLOUDRU_JOB_IAM_UNAVAILABLE");
        const json = (await login.json()) as { access_token?: string };
        if (!json.access_token) throw Error("CLOUDRU_JOB_IAM_NO_TOKEN");
        cachedToken = json.access_token;
        tokenExpires = Date.now() + 4 * 60_000;
      }
      for (const name of CLOUDRU_MEDIA_JOB_NAMES) {
        const result = await http("https://containers.api.cloud.ru/v2/jobs/" + name + ":execute", {
          method: "POST",
          headers: { authorization: "Bearer " + cachedToken, "content-type": "application/json" },
          body: JSON.stringify({ projectId: env.CLOUDRU_PROJECT_ID, jobName: name, params: {} }),
          signal: AbortSignal.timeout(18000),
        });
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
