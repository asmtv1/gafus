/** Add dormant second Feed Jobs by cloning the live, immutable processor config.
 * Secrets remain in memory. Existing jobs are verified, never overwritten.
 * This does not deploy the local Worker or execute any processing jobs.
 */
const mode = process.argv[2] ?? "--plan";
if (!["--plan", "--apply", "--verify"].includes(mode)) throw Error("INVALID_POOL_ACTION");
const pairs = [
  { source: "gafus-feed-photo", target: "gafus-feed-photo-2", kind: "photo" },
  { source: "gafus-feed-video", target: "gafus-feed-video-2", kind: "video" },
];
if (mode === "--plan") {
  console.log(JSON.stringify({ mode, mutates: false, pairs, runImmediately: false }));
  process.exit(0);
}
const e = process.env;
if (!/^[a-f0-9-]{32,40}$/.test(e.CLOUDRU_PROJECT_ID ?? "") || !e.CLOUDRU_KEY_ID || !e.CLOUDRU_KEY_SECRET)
  throw Error("MISSING_CLOUDRU_AUTH");
if (mode === "--apply" && e.CLOUDRU_FEED_POOLS_CONFIRM !== "create-dormant-feed-pool-jobs")
  throw Error("FEED_POOL_APPLY_NOT_AUTHORIZED");
const auth = await fetch("https://iam.api.cloud.ru/api/v1/auth/token", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ keyId: e.CLOUDRU_KEY_ID, secret: e.CLOUDRU_KEY_SECRET }),
  signal: AbortSignal.timeout(15000),
});
if (!auth.ok) throw Error("POOL_IAM_FAILED_" + auth.status);
const token = (await auth.json()).access_token;
if (!token) throw Error("POOL_IAM_NO_TOKEN");
async function api(method, path, body) {
  const response = await fetch("https://containers.api.cloud.ru/v2" + path, {
    method,
    headers: { authorization: "Bearer " + token, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw Error("POOL_API_FAILED_" + method + "_" + response.status);
  return response.json();
}
const query = "?projectId=" + e.CLOUDRU_PROJECT_ID;
const listing = await api("GET", "/jobs" + query + "&pageSize=100");
const existing = Array.isArray(listing) ? listing : listing.data;
if (!Array.isArray(existing)) throw Error("POOL_LIST_SCHEMA_INVALID");
function validate(job, name, kind) {
  const c = job.template?.containers?.[0];
  const vars = Object.fromEntries((c?.env ?? []).map(x => [x.name, x.value]));
  if (job.name !== name || job.projectId !== e.CLOUDRU_PROJECT_ID ||
      job.template?.containers?.length !== 1 || job.configuration?.privileged !== false ||
      !/^gafus\.cr\.cloud\.ru\/gafus-feed-worker@sha256:[a-f0-9]{64}$/.test(c?.image ?? "") ||
      vars.FEED_RUN_ONCE !== "true" || vars.FEED_WORKER_TYPE !== kind ||
      vars.FEED_INTERNAL_BASE_URL !== "https://api.gafus.ru" ||
      !vars.FEED_INTERNAL_HMAC_SECRET || vars.FEED_BUCKET !== "gafus-feed-private")
    throw Error("POOL_UNSAFE_CONFIG_" + name);
  return c;
}
// Preflight both sources and any existing replicas before creating anything.
const planned = [];
for (const pair of pairs) {
  const source = await api("GET", "/jobs/" + pair.source + query);
  validate(source, pair.source, pair.kind);
  const target = existing.some(x => x.name === pair.target)
    ? await api("GET", "/jobs/" + pair.target + query) : null;
  if (target) {
    const actual = validate(target, pair.target, pair.kind);
    const expected = source.template.containers[0];
    const variables = c => Object.fromEntries(c.env.map(x => [x.name, x.value]).sort(([a], [b]) => a.localeCompare(b)));
    if (actual.image !== expected.image ||
        JSON.stringify(actual.resources) !== JSON.stringify(expected.resources) ||
        JSON.stringify(variables(actual)) !== JSON.stringify(variables(expected)) ||
        target.template.timeout !== source.template.timeout)
      throw Error("POOL_EXISTING_CONFIG_DIFFERS_" + pair.target);
  } else if (mode === "--verify") throw Error("POOL_MISSING_" + pair.target);
  planned.push({ pair, source, target });
}
for (const { pair, source, target } of planned) {
  if (!target) {
    const template = structuredClone(source.template);
    // Service scaling fields in GET responses do not control Jobs concurrency.
    delete template.scaling;
    delete template.idleTimeout;
    delete template.protocol;
    template.maxRetries = 3;
    template.containers[0].name = pair.target;
    delete template.containers[0].containerPort;
    await api("POST", "/jobs/", {
      projectId: e.CLOUDRU_PROJECT_ID,
      name: pair.target,
      description: "GAFUS durable core-owned media queue processor",
      runImmediately: false,
      configuration: structuredClone(source.configuration),
      template,
    });
  }
  const actual = await api("GET", "/jobs/" + pair.target + query);
  const c = validate(actual, pair.target, pair.kind);
  if (mode === "--verify" && actual.status !== "ready") throw Error("POOL_NOT_READY_" + pair.target);
  console.log(JSON.stringify({ name: pair.target, action: target ? "verified" : "created",
    status: actual.status, image: c.image, resources: c.resources,
    timeout: actual.template.timeout, executed: false }));
}
