/**
 * Trigger only Feed/Chat VIDEO Cloud.ru Jobs. All photo/image Jobs are retired.
 * Core owns all durable claims/leases; overlapping Cloud invocations are idempotent.
 * No schedule is installed unless CLOUDRU_MEDIA_JOBS_ENABLED=true.
 */
const DEFAULT_MEDIA_JOB_NAMES = ["gafus-feed-video"] as const;
export const CLOUDRU_FEED_JOB_POOLS = {
  video: ["gafus-feed-video", "gafus-feed-video-2"],
} as const;
export const CLOUDRU_CHAT_JOB_POOLS = {
  video: ["gafus-chat-video", "gafus-chat-video-2"],
} as const;
export const CLOUDRU_MEDIA_JOB_NAMES = [
  ...DEFAULT_MEDIA_JOB_NAMES,
  ...CLOUDRU_CHAT_JOB_POOLS.video,
  "gafus-feed-video-2",
] as const;

export type CloudruMediaJobName = (typeof CLOUDRU_MEDIA_JOB_NAMES)[number];
type HttpFetch = typeof fetch;
/** Only safe diagnostic identifiers are logged: no URLs, IAM keys or payloads. */
export function safeCloudruDispatchError(error: unknown): Error {
  if (error instanceof Error) {
    if (/^CLOUDRU_(?:MEDIA_DISPATCHER_UNSAFE_CONFIGURATION|JOB_IAM_(?:UNAVAILABLE(?:_[1-5][0-9]{2})?|NO_TOKEN)|JOB_EXECUTION_FAILED_gafus-[a-z0-9-]+_[1-5][0-9]{2}|JOB_(?:IAM|EXECUTION)_NETWORK_(?:EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|TIMEOUT|UNAVAILABLE))$/.test(error.message)) {
      return new Error(error.message);
    }
  }
  return new Error("CLOUDRU_JOB_UNKNOWN_FAILURE");
}
/** Bound transient transport errors without including request credentials in logs. */
async function requestCloudru(
  http: HttpFetch, url: string, init: RequestInit, phase: "IAM" | "EXECUTION",
): Promise<Response> {
  try {
    return await http(url, init);
  } catch (error) {
    const e = error as { name?: string; cause?: { code?: string } } | null;
    const code = e?.name === "TimeoutError" || e?.name === "AbortError"
      ? "TIMEOUT" : e?.cause?.code;
    const known = ["EAI_AGAIN", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"];
    throw new Error(`CLOUDRU_JOB_${phase}_NETWORK_${code && known.includes(code) ? code : code === "TIMEOUT" ? code : "UNAVAILABLE"}`);
  }
}
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
    (names.some((name) => name.startsWith("gafus-chat-")) &&
      (env.CHAT2_PROCESSOR_READY !== "true" || env.CHAT2_V2_CORE_ENABLED !== "true" ||
        env.CHAT2_V2_MEDIA_ENABLED !== "true")) ||
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
        // Chat2 uses IAM v2 in its separate organization; Feed/Gallery use v1.
        // Keep this per-allowlisted-name: mixing IAM scopes is forbidden.
        const iamV2=names.every(name=>
          name.startsWith("gafus-chat-"));
        // IAM token exchange is safe to retry after a transient DNS timeout or
        // provider 429/5xx. NEVER retry :execute on an unknown ACK: duplicate
        // Cloud executions are billable and can race the durable lease gate.
        let login: Response | undefined;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            login = await requestCloudru(http, "https://iam.api.cloud.ru/api/"+
              (iamV2?"v2":"v1")+"/auth/token", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ keyId: env.CLOUDRU_KEY_ID, secret: env.CLOUDRU_KEY_SECRET }),
              signal: AbortSignal.timeout(12000),
            }, "IAM");
          } catch (error) {
            if (attempt === 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 250));
            continue;
          }
          if (login.ok || attempt === 1 ||
              (login.status !== 429 && login.status < 500)) break;
          await login.body?.cancel();
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        if (!login?.ok) throw Error("CLOUDRU_JOB_IAM_UNAVAILABLE_" + login?.status);
        const json = (await login.json()) as { access_token?: string };
        if (!json.access_token) throw Error("CLOUDRU_JOB_IAM_NO_TOKEN");
        cachedToken = json.access_token;
        tokenExpires = Date.now() + 4 * 60_000;
      }
      for (const name of names) {
        const result = await requestCloudru(http, "https://containers.api.cloud.ru/v2/jobs/" + name + ":execute", {
          method: "POST",
          headers: { authorization: "Bearer " + cachedToken, "content-type": "application/json" },
          body: JSON.stringify({ projectId: env.CLOUDRU_PROJECT_ID, jobName: name, params: {} }),
          signal: AbortSignal.timeout(18000),
        }, "EXECUTION");
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

/** Chat2 video-only Cloud Jobs; photos are WebP encoded on the client. */
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
