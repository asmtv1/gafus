/** Read-only original Hono app smoke with current modules on an ephemeral 127.0.0.1 port.
 * Guardrails: isolated WORK DB + local JWT + synthetic local MinIO config + GET only.
 * Does not stop or reconfigure existing ports 3001/5173/9000 or any worker.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { once } from "node:events";
const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const SCRATCH = ROOT + "/.local-pg-scratch";
const socket = SCRATCH + "/production_snapshot_20261024/s";
const envFile = SCRATCH + "/production_snapshot_20261024/app.env";
const secretFile = SCRATCH + "/hono-local-access.secret";
function assert(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error("FEED_V2_HTTP_READONLY_DENIED_" + reason);
}
assert(realpathSync(ROOT) === ROOT && realpathSync(process.cwd()) === ROOT + "/apps/api", "PROJECT");
for (const path of [socket, envFile, secretFile]) assert(realpathSync(path) === path, "PATH");
assert((statSync(envFile).mode & 0o777) === 0o600 &&
  (statSync(secretFile).mode & 0o777) === 0o600, "PRIVATE_CREDENTIALS");
const line = readFileSync(envFile, "utf8").split(/\r?\n/).find(v => /^DATABASE_URL=/.test(v));
assert(line, "LOCAL_WORK_URL");
const workUrl = line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
const u = new URL(workUrl);
assert(u.protocol === "postgresql:" && u.hostname === "127.0.0.1" && u.port === "55921" &&
  u.pathname === "/gafus_refactor_real_work_20261024" &&
  u.username === "gafus_refactor_local_real", "WORK_DB_IDENTITY");
const pg = (q: string) => execFileSync("/opt/homebrew/bin/psql", [
  "-w", "-X", "-qAt", "-h", socket, "-p", "55921", "-d", "gafus_refactor_real_work_20261024",
  "-v", "ON_ERROR_STOP=1", "-c", q,
], { encoding: "utf8", timeout: 9000,
  env: { NODE_ENV: "development", PATH: "/opt/homebrew/bin:/usr/bin:/bin",
    PGCONNECT_TIMEOUT: "3", PGOPTIONS: "-c default_transaction_read_only=on" },
}).trim();
assert(pg("select current_setting('data_directory')") === ROOT +
  "/.local-pg-scratch/production_snapshot_20261024/data", "PHYSICAL_DB_PATH");
const count = () => pg(`select (select count(*) from "FeedPost") || ':' ||
  (select count(*) from "FeedMediaAsset") || ':' ||
  (select count(*) from "User")`);
const before = count();
const actor = JSON.parse(pg(`select row_to_json(t) from (select id,username,role from "User"
  where role='USER' and "registrationPending"=false order by id limit 1) t`)) as
  { id: string; username: string; role: "USER" };
assert(actor?.id && actor?.username && actor.role === "USER", "LOCAL_ACTOR");
Object.assign(process.env, {
  NODE_ENV: "development", DATABASE_URL: workUrl,
  JWT_SECRET: readFileSync(secretFile, "utf8").trim(),
  REDIS_URL: "redis://127.0.0.1:55927/1",
  GAFUS_LOCAL_ISOLATED_API: "1", GAFUS_LOCAL_READONLY_CDN: "enabled",
  GAFUS_LOCAL_BROWSER_AUTH: "1",
  FEED_ENABLED: "true", FEED_PROCESSOR_READY: "true",
  FEED_MEDIA_FALLBACK_ENABLED: "false", GALLERY_MEDIA_FALLBACK_ENABLED: "false",
  GAFUS_ISOLATED_NONPROD_S3: "enabled",
  GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000",
  GAFUS_ISOLATED_S3_FEED_BUCKET: "gafus-refactor-feed-test",
  GAFUS_ISOLATED_S3_GALLERY_BUCKET: "gafus-refactor-gallery-test",
  GAFUS_ISOLATED_S3_QUESTIONS_BUCKET: "gafus-refactor-questions-test",
  GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET: "gafus-refactor-documents-test",
  GAFUS_LOCAL_MEDIA_HTTP_ACCEPTANCE: "1",
  CLOUDRU_MEDIA_JOBS_ENABLED: "false",
  FEED_INTERNAL_HMAC_SECRET: "local-feed-v2-readonly-no-side-effects-xxxxxxx",
  CDN_HEALTH_MONITOR_ENABLED: "false",
});
const [{ app }, { serve }, { generateAccessToken }, { prisma }] = await Promise.all([
  import("../app.js"), import("@hono/node-server"),
  import("@gafus/auth/jwt"), import("@gafus/prisma"),
]);
const jwt = await generateAccessToken(actor);
const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 });
try {
  if (!server.listening) await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string" && address.port > 0 && address.port !== 3001,
    "EPHEMERAL_LOOPBACK");
  const url = `http://127.0.0.1:${address.port}/api/v1/feed`;
  const get = async (path: string, auth = true) => fetch(url + path, {
    method: "GET", headers: {
      Accept: "application/json", ...(auth ? { Authorization: "Bearer " + jwt } : {}),
    }, signal: AbortSignal.timeout(10000), redirect: "error",
  });
  const unauth = await get("/posts?pageSize=10&sort=new", false);
  assert(unauth.status === 401, "ANON_CANNOT_LIST");
  const status = await get("/status");
  const statusJson = await status.json().catch(() => null);
  assert(status.status === 200 && statusJson?.success === true &&
    statusJson?.data?.enabled === true, "AUTH_STATUS");
  const response = await get("/posts?pageSize=10&sort=new");
  const json = await response.json().catch(() => null);
  if (response.status !== 200) console.warn("FEED_V2_EPHEMERAL_HTTP_DIAGNOSTIC", JSON.stringify({
    status: response.status, code: typeof json?.code === "string" ? json.code : "UNKNOWN",
  }));
  assert(response.status === 200 && json?.success === true &&
    Array.isArray(json?.data?.items), "AUTH_POSTS");
  for (const post of json.data.items as Record<string, unknown>[]) {
    assert(Array.isArray(post.attachments), "ATTACHMENTS_CONTRACT");
    for (const asset of post.attachments as Record<string, unknown>[]) {
      assert(asset.mp4Urls === null || asset.mp4Urls === undefined ||
        typeof (asset.mp4Urls as Record<string, unknown>)["360"] === "string", "BASELINE_MP4_REQUIRED");
    }
  }
  const removed = await get("/media/m1/playback");
  assert(removed.status === 404 || removed.status === 405, "HLS_TICKET_NOT_ROUTED");
  assert(before === count(), "UNCHANGED_ROW_COUNTS");
  console.log("FEED_V2_EPHEMERAL_HONO_READONLY_PASS", JSON.stringify({
    listing: response.status, posts: json.data.items.length, anonymous: unauth.status,
    noHlsTicket: removed.status, isolatedPgOnly: true, zeroWrites: true,
  }));
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.$disconnect();
}
// The imported original app can retain its own Redis subscriptions and
// process-exit hooks. After closing OUR ephemeral HTTP listener and Prisma,
// end this isolated smoke-process explicitly; never affect shared servers.
process.exit(0);
