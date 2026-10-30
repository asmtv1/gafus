/** Read-only, authenticated acceptance of the running isolated Hono Moments API.
 * Never reads production, mutates SQL, writes S3, or prints JWT/user records.
 * Execute ONLY in /Users/asmtv1/Desktop/gafus-refactor/apps/api.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";

const root = "/Users/asmtv1/Desktop/gafus-refactor";
const socket = root + "/.local-pg-scratch/production_snapshot_20261024/s";
const privateJwt = root + "/.local-pg-scratch/hono-local-access.secret";
function check(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(`FEED_V2_READONLY_DENIED_${label}`);
}
check(realpathSync(root) === root, "PROJECT_ROOT");
check(realpathSync(process.cwd()) === root + "/apps/api", "CWD");
check(realpathSync(socket) === socket, "PROJECT_PG_SOCKET");
check(realpathSync(privateJwt) === privateJwt && (statSync(privateJwt).mode & 0o777) === 0o600, "LOCAL_JWT_FILE");
const psql = (query: string) => execFileSync("/opt/homebrew/bin/psql", [
  "-w", "-X", "-qAt", "-h", socket, "-p", "55921", "-d", "gafus_refactor_real_work_20261024",
  "-v", "ON_ERROR_STOP=1", "-c", query,
], { encoding: "utf8", timeout: 10_000,
  env: { NODE_ENV: "development", PATH: "/opt/homebrew/bin:/usr/bin:/bin", PGCONNECT_TIMEOUT: "3",
    PGOPTIONS: "-c default_transaction_read_only=on" } }).trim();
const actualDir = psql("SELECT current_setting('data_directory')");
check(actualDir === root + "/.local-pg-scratch/production_snapshot_20261024/data", "DB_IDENTITY");
const before = JSON.parse(psql(`SELECT json_build_object('users',(SELECT count(*) FROM "User"),
  'posts',(SELECT count(*) FROM "FeedPost"), 'media',(SELECT count(*) FROM "FeedMediaAsset"));`));
const actor = JSON.parse(psql(`SELECT row_to_json(r) FROM (
  SELECT id,username,role FROM "User"
  WHERE role='USER' AND "registrationPending"=false AND username IS NOT NULL
  ORDER BY id LIMIT 1) r`)) as { id: string; username: string; role: "USER" };
check(actor?.id && actor.username && actor.role === "USER", "ACTOR");
process.env.JWT_SECRET = readFileSync(privateJwt, "utf8").trim();
const { generateAccessToken } = await import("@gafus/auth/jwt");
const token = await generateAccessToken(actor);
check(token.length > 32, "AUTH_TOKEN");
const api = "http://127.0.0.1:3001";
const get = async (path: string, authorized: boolean) => fetch(api + path, {
  method: "GET", headers: { Accept: "application/json",
    ...(authorized ? { Authorization: `Bearer ${token}` } : {}) },
  signal: AbortSignal.timeout(8000), redirect: "error",
});
const anon = await get("/api/v1/feed/posts?sort=new&pageSize=10", false);
check(anon.status === 401, "PRIVATE_POSTS");
const status = await get("/api/v1/feed/status", true);
const statusJson = await status.json().catch(() => null);
check(status.status === 200 && statusJson?.success === true &&
  status.headers.get("cache-control")?.includes("no-store"), "AUTH_STATUS");
check(statusJson.data?.smartEnabled === true, "SMART_SORT_ENABLED_IN_LOCAL_HONO");
const smartSettings = await get("/api/v1/feed/personalization", true);
const smartSettingsJson = await smartSettings.json().catch(() => null);
check(smartSettings.status === 200 && smartSettingsJson?.success === true &&
  typeof smartSettingsJson.data?.enabled === "boolean" &&
  typeof smartSettingsJson.data?.useCity === "boolean" &&
  typeof smartSettingsJson.data?.usePets === "boolean", "SMART_PREFERENCES_GET");
const smart = await get("/api/v1/feed/posts?sort=smart&pageSize=10", true);
const smartJson = await smart.json().catch(() => null);
check(smart.status === 200 && smartJson?.success === true &&
  Array.isArray(smartJson.data?.items) && smartJson.data?.feedMeta?.mode === "smart" &&
  smartJson.data?.feedMeta?.personalized === true &&
  typeof smartJson.data?.feedMeta?.rankingSessionId === "string",
  "SMART_CORE_PERSONALIZED_RANKING");
const list = await get("/api/v1/feed/posts?sort=new&pageSize=10", true);
const json = await list.json().catch(() => null);
if (list.status !== 200 || json?.success !== true) {
  console.warn("FEED_V2_READONLY_DIAGNOSTIC", JSON.stringify({ http: list.status,
    code: typeof json?.code === "string" ? json.code : "UNKNOWN",
    statusEnabled: statusJson?.data?.enabled === true }));
}
check(list.status === 200 && json?.success === true && Array.isArray(json.data?.items) &&
  list.headers.get("cache-control")?.includes("no-store"), "AUTH_LIST");
const posts: unknown[] = json.data.items;
for (const post of posts) {
  check(!!post && typeof post === "object", "POST_SHAPE");
  const row = post as Record<string, unknown>;
  check(Array.isArray(row.attachments), "MEDIA_LIST");
  for (const attachment of row.attachments as Record<string, unknown>[]) {
    if (attachment.mp4Urls !== null && attachment.mp4Urls !== undefined) {
      const variants = attachment.mp4Urls as Record<string, string>;
      check(!!variants["360"] && Object.values(variants).every(value =>
        typeof value === "string" && value.includes(".mp4")), "MP4_SIGNATURE");
    }
  }
}
// Confirm the running Vite /api/v1 proxy reaches THIS new Hono, not a stale mock.
const vite = await fetch("http://127.0.0.1:5173/api/v1/feed/posts?sort=new&pageSize=10", {
  method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  signal: AbortSignal.timeout(8000), redirect: "error",
});
const viteBody = await vite.json().catch(() => null);
check(vite.status === 200 && viteBody?.success === true &&
  Array.isArray(viteBody?.data?.items), "AUTH_VITE_PROXY");
const viteSmartStatus = await fetch("http://127.0.0.1:5173/api/v1/feed/status", {
  method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  signal: AbortSignal.timeout(8000), redirect: "error",
});
const viteSmartStatusJson = await viteSmartStatus.json().catch(() => null);
check(viteSmartStatus.status === 200 && viteSmartStatusJson?.success === true &&
  viteSmartStatusJson.data?.smartEnabled === true, "VITE_SMART_TAB_FLAG");
const viteSmartFeed = await fetch("http://127.0.0.1:5173/api/v1/feed/posts?sort=smart&pageSize=10", {
  method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  signal: AbortSignal.timeout(8000), redirect: "error",
});
const viteSmartFeedJson = await viteSmartFeed.json().catch(() => null);
check(viteSmartFeed.status === 200 && viteSmartFeedJson?.success === true &&
  viteSmartFeedJson.data?.feedMeta?.mode === "smart" &&
  viteSmartFeedJson.data?.feedMeta?.personalized === true,
  "VITE_SMART_PERSONALIZED_RANKING");
const after = JSON.parse(psql(`SELECT json_build_object('users',(SELECT count(*) FROM "User"),
  'posts',(SELECT count(*) FROM "FeedPost"), 'media',(SELECT count(*) FROM "FeedMediaAsset"));`));
check(JSON.stringify(before) === JSON.stringify(after), "ROW_COUNTS_UNCHANGED");
console.log("FEED_V2_READONLY_HONO: PASS", JSON.stringify({
  auth: status.status, listing: list.status, viteProxy: vite.status, anonymous: anon.status,
  smartSort: smart.status, smartPersonalized: smartJson.data.feedMeta.personalized,
  viteSmart: viteSmartFeed.status, viteSmartPersonalized: viteSmartFeedJson.data.feedMeta.personalized,
  postsExamined: posts.length, nonMutating: true,
  legacyInputRowsPreserved: before.media, newMediaToMigrate: false,
}));
