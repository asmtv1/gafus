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
// Existing Cloud.ru project is at its 10-Job quota. Reuse the ONLY existing
// Questions Job with up to two executions. Never create/dispatch a phantom -2.
// The durable PostgreSQL Questions lease gate caps active photo conversions.
export const CLOUDRU_QUESTIONS_PHOTO_POOL = [
  "gafus-questions-photo",
] as const;
export const CLOUDRU_CHAT_JOB_POOLS = {
  photo: ["gafus-chat-photo", "gafus-chat-photo-2"],
  video: ["gafus-chat-video", "gafus-chat-video-2"],
} as const;
export const CLOUDRU_MEDIA_JOB_NAMES = [
  ...DEFAULT_MEDIA_JOB_NAMES,
  ...CLOUDRU_QUESTIONS_PHOTO_POOL,
  ...CLOUDRU_CHAT_JOB_POOLS.photo,
  ...CLOUDRU_CHAT_JOB_POOLS.video,
  "gafus-feed-photo-2",
  "gafus-feed-video-2",
  "gafus-gallery-process-2",
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
    (names.some((name) => name.startsWith("gafus-feed")) &&
      (env.FEED_PROCESSOR_READY !== "true" ||
       // The legacy same-named Cloud jobs may point at api.gafus.ru.
       // Explicit operator verification of isolated Refactor-owned jobs is mandatory.
       env.FEED_CLOUDRU_REFRACTOR_VERIFIED !== "true")) ||
    (names.some((name) => name.startsWith("gafus-questions-photo")) &&
      (env.QUESTIONS_V2_MEDIA_ENABLED !== "true" ||
       env.QUESTIONS_V2_PROCESSOR_READY !== "true" ||
       env.QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED !== "true" ||
       // Cloud resources must be separately owned and verified Refactor-only.
       env.QUESTIONS_V2_CLOUD_REFRACTOR_VERIFIED !== "true")) ||
    (names.some((name) => name.startsWith("gafus-chat-")) &&
      (env.CHAT2_PROCESSOR_READY !== "true" || env.CHAT2_V2_CORE_ENABLED !== "true" ||
        env.CHAT2_V2_MEDIA_ENABLED !== "true")) ||
    (names.some(name => name.startsWith("gafus-gallery-process")) &&
      env.GALLERY_PROCESSOR_READY !== "true") ||
    (names.includes("gafus-gallery-process-2") &&
      env.GALLERY_PROCESSOR_SECOND_READY !== "true") ||
    names.length === 0 ||
    names.some((name) => !CLOUDRU_MEDIA_JOB_NAMES.includes(name))
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
        // Cloud.ru requires IAM v2 for both Questions and the separately
        // scoped Chat2 organization. Feed/Gallery still use IAM v1.
        // Keep this per-allowlisted-name: mixing IAM scopes is forbidden.
        const iamV2=names.every(name=>
          name.startsWith("gafus-questions-photo") || name.startsWith("gafus-chat-"));
        const login = await http("https://iam.api.cloud.ru/api/"+
          (iamV2?"v2":"v1")+"/auth/token", {
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
      for (const name of names) {
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

/** One accepted launch per upload, alternating Jobs sharing Core's durable queue.
 * Advance before awaiting so retries also try the other Job after rejection.
 * Recovery only launches due work, never a fixed number of empty cloud jobs.
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

/** Gallery's second provisioned Job is strictly opt-in until its callback
 * permissions and S3 processor image have been independently deployed.
 * Retry after a lost launch ACK alternates Jobs; Core's attemptToken and
 * create-if-absent claims remain the only publish authority.
 */
export function createCloudruGalleryPoolDispatcher(
  env: Record<string, string | undefined> = process.env,
  http: HttpFetch = fetch,
) {
  const names: CloudruMediaJobName[] = env.GALLERY_PROCESSOR_SECOND_READY === "true"
    ? ["gafus-gallery-process", "gafus-gallery-process-2"]
    : ["gafus-gallery-process"];
  const dispatchers = names.map(name => createCloudruMediaDispatcher(env, http, [name]));
  let next = 0;
  return () => {
    const chosen = dispatchers[next]!;
    next = (next + 1) % dispatchers.length;
    return chosen();
  };
}


/** Chat2 V2 ONLY: two independent Cloud.ru Jobs per kind, alternating each
 * accepted wake-up. Redis carries only UUIDs, never media bytes. Core owns
 * the typed, SKIP LOCKED claim; the other chat kind cannot steal this task.
 * This is a separate opt-in pool: existing Feed/Gallery launch lists unchanged.
 */
export function createCloudruChatPoolDispatcher(
  kind: keyof typeof CLOUDRU_CHAT_JOB_POOLS,
  env: Record<string,string|undefined> = process.env,
  http: HttpFetch = fetch,
) {
  // Chat2 lives in a DIFFERENT Cloud.ru organization/project. Never reuse
  // the primary Feed/Gallery IAM key or project ID, even if both are populated.
  // Refuse activation until scoped new-org access is independently verified.
  const newProject="6777bd18-4ee9-4d15-bb1b-134f7a18ed3a";
  if(env.CLOUDRU_MEDIA_JOBS_ENABLED==="true" &&
     (env.CHAT2_CLOUDRU_PROJECT_VERIFIED!=="true" ||
      env.CHAT2_CLOUDRU_PROJECT_ID!==newProject ||
      !env.CHAT2_CLOUDRU_KEY_ID || !env.CHAT2_CLOUDRU_KEY_SECRET))
    throw Error("CHAT2_CLOUDRU_NEW_ORGANIZATION_UNVERIFIED");
  const scopedEnv={
    ...env,
    CLOUDRU_PROJECT_ID:env.CHAT2_CLOUDRU_PROJECT_ID ?? "",
    CLOUDRU_KEY_ID:env.CHAT2_CLOUDRU_KEY_ID ?? "",
    CLOUDRU_KEY_SECRET:env.CHAT2_CLOUDRU_KEY_SECRET ?? "",
  };
  const dispatchers=CLOUDRU_CHAT_JOB_POOLS[kind].map(name=>
    createCloudruMediaDispatcher(scopedEnv,http,[name]));
  let next=0;
  return ()=>{
    const selected=dispatchers[next]!;
    next=(next+1)%dispatchers.length;
    return selected();
  };
}

/** One existing Questions photo-only Job, up to two independent executions.
 * Does not require a new Cloud Job or touch unrelated Feed/Gallery capacity. */
export function createCloudruQuestionsPhotoPoolDispatcher(
  env:Record<string,string|undefined>=process.env,http:HttpFetch=fetch,
) {
  const dispatchers=CLOUDRU_QUESTIONS_PHOTO_POOL.map(name=>
    createCloudruMediaDispatcher(env,http,[name]));
  let next=0;
  return ()=>{
    const selected=dispatchers[next]!;
    next=(next+1)%dispatchers.length;
    return selected();
  };
}
