/**
 * Trigger Cloud.ru Container Jobs every minute while local GAFUS Worker is healthy.
 * Core owns all durable claims/leases; overlapping Cloud invocations are idempotent.
 * No schedule is installed unless CLOUDRU_MEDIA_JOBS_ENABLED=true.
 */
import { noteCloudruExecution } from "./cloudru-media-telemetry";

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
  "gafus-gallery-process-2",
  "gafus-feed-photo-2",
  "gafus-feed-video-2",
  "gafus-questions-photo",
] as const;

export type CloudruMediaJobName = (typeof CLOUDRU_MEDIA_JOB_NAMES)[number];
type HttpFetch = typeof fetch;
/** Active provider executions: stale records beyond timeout+grace are reported
 * separately, not silently treated as fresh capacity consumers. Cloud.ru is
 * authoritative for final execution admission.
 */
export function inspectFeedPhotoCapacity(
  response: unknown, nowMs: number, timeoutSeconds = 240,
) {
  if (!response || typeof response !== "object" ||
      !Array.isArray((response as {data?: unknown}).data))
    throw Error("CLOUDRU_FEED_PHOTO_EXECUTIONS_INVALID");
  const rows = (response as {data: unknown[]}).data;
  let active = 0, stale = 0, oldestStaleSeconds = 0;
  for (const value of rows) {
    if (!value || typeof value !== "object")
      throw Error("CLOUDRU_FEED_PHOTO_EXECUTION_INVALID");
    const row = value as { executionStatus?: unknown; createdAt?: unknown };
    if (!["created", "creating", "running", "canceling", "cancelling"].includes(
      String(row.executionStatus))) continue;
    const created = typeof row.createdAt === "string" ? Date.parse(row.createdAt) : NaN;
    if (!Number.isFinite(created)) { active++; continue; }
    const age = (nowMs - created) / 1000;
    if (age > timeoutSeconds + 120) {
      stale++;
      oldestStaleSeconds = Math.max(oldestStaleSeconds, Math.floor(age));
    } else active++;
  }
  return { active, stale, oldestStaleSeconds, atCapacity: active >= 5 };
}

export function createCloudruMediaDispatcher(
  env: Record<string, string | undefined> = process.env,
  http: HttpFetch = fetch,
  names: readonly CloudruMediaJobName[] = DEFAULT_MEDIA_JOB_NAMES,
  options: { galleryAdmission?: boolean; galleryPoolAdmission?: boolean;
    feedPhotoAdmission?: boolean;
    reservedCount?: (name: CloudruMediaJobName) => number;
    onAccepted?: (name: CloudruMediaJobName) => void } = {},
) {
  if (env.CLOUDRU_MEDIA_JOBS_ENABLED !== "true")
    return async () => ({ disabled: true, dispatched: 0 });
  if (
    !/^[a-f0-9-]{32,40}$/.test(env.CLOUDRU_PROJECT_ID ?? "") ||
    !env.CLOUDRU_KEY_ID ||
    !env.CLOUDRU_KEY_SECRET ||
    (names.some((name) => name.startsWith("gafus-feed")) && env.FEED_PROCESSOR_READY !== "true") ||
    (names.some(name => name.startsWith("gafus-gallery-process")) &&
      env.GALLERY_PROCESSOR_READY !== "true") ||
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
    if (phase === "execute" && name)
      noteCloudruExecution(name, httpStatus, durationMs);
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
      // A Gallery timeout must not starve photo/video recovery. Keep bounded
      // serial calls to Cloud.ru, but attempt the remaining independent Jobs
      // before reporting a failed scheduler tick.
      let firstFailure: unknown;
      for (const name of names) {
        const dispatchStart = performance.now();
        let responseReceived = false;
        try {
          if ((options.feedPhotoAdmission && /^gafus-feed-photo(?:-2)?$/.test(name)) ||
              (options.galleryPoolAdmission && /^gafus-gallery-process(?:-2)?$/.test(name))) {
            // Unlike Gallery's advisory check, an uncertain Feed Photo capacity
            // read FAILS CLOSED. Cron/next wake retries without paid duplicates.
            const pageToken = Buffer.from(JSON.stringify({
              limit: 100, offset: 0, filter_fields: "", ordering: "-created_at", search: null,
            })).toString("base64");
            const list = await http(
              "https://containers.api.cloud.ru/v2/jobs/" + name + "/executions" +
              "?projectId=" + encodeURIComponent(env.CLOUDRU_PROJECT_ID!) +
              "&pageToken=" + encodeURIComponent(pageToken),
              { headers: { authorization: "Bearer " + cachedToken },
                signal: AbortSignal.timeout(8000) },
            );
            if (!list.ok) {
              await list.body?.cancel();
              throw Error((options.galleryPoolAdmission ? "CLOUDRU_GALLERY_POOL_CAPACITY_UNAVAILABLE_" : "CLOUDRU_FEED_PHOTO_CAPACITY_UNAVAILABLE_") + list.status);
            }
            const cap = inspectFeedPhotoCapacity(await list.json(), Date.now(),
              options.galleryPoolAdmission ? 120 : 240);
            if (cap.stale) console.warn(JSON.stringify({
              event: options.galleryPoolAdmission
                ? "cloudru_gallery_stale_executions" : "cloudru_feed_photo_stale_executions",
              job: name, stale: cap.stale, oldestStaleSeconds: cap.oldestStaleSeconds,
            }));
            if (cap.active + (options.reservedCount?.(name) ?? 0) >= 5) {
              return {dispatched, blocked: true};
            }
          }
          const result = await http("https://containers.api.cloud.ru/v2/jobs/" + name + ":execute", {
            method: "POST",
            headers: { authorization: "Bearer " + cachedToken, "content-type": "application/json" },
            body: JSON.stringify({ projectId: env.CLOUDRU_PROJECT_ID, jobName: name, params: {} }),
            signal: AbortSignal.timeout(18000),
          });
          responseReceived = true;
          emit("execute", performance.now() - dispatchStart, name, result.status);
          if (!result.ok) {
            if ([401, 403].includes(result.status)) {
              cachedToken = undefined;
              tokenExpires = 0;
            }
            throw Error("CLOUDRU_JOB_EXECUTION_FAILED_" + name + "_" + result.status);
          }
          dispatched++;
          options.onAccepted?.(name);
        } catch (error) {
          if (!responseReceived) {
            const code = error instanceof Error ? error.name : "";
            noteCloudruExecution(name, undefined, performance.now() - dispatchStart,
              code === "TimeoutError" || code === "AbortError" ? "timeout" : "other");
          }
          firstFailure ??= error;
          // Authentication is a global failure, not an independent Job issue.
          if (!cachedToken) break;
        }
      }
      if (firstFailure) throw firstFailure;
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
