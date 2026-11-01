/** Real Prisma + real restored isolated WORK database, with read-only queries only.
 * It verifies native Feed V2 projection in the presence of preserved old fixtures.
 * Never uses the root .env, writes data, or contacts S3/production.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
const root = "/Users/asmtv1/Desktop/gafus-refactor";
const appEnv = root + "/.local-pg-scratch/production_snapshot_20261024/app.env";
const socket = root + "/.local-pg-scratch/production_snapshot_20261024/s";
function check(ok: unknown, reason: string): asserts ok {
  if (!ok) throw Error(`FEED_V2_WORKDB_READONLY_DENIED_${reason}`);
}
check(realpathSync(root) === root && realpathSync(process.cwd()) === root + "/apps/api", "PROJECT");
check(realpathSync(appEnv) === appEnv && (statSync(appEnv).mode & 0o777) === 0o600, "WORK_ENV");
check(realpathSync(socket) === socket, "SOCKET");
const row = readFileSync(appEnv, "utf8").split(/\r?\n/).find(v => /^DATABASE_URL=/.test(v));
check(row, "WORK_URL");
const raw = row.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
const parsed = new URL(raw);
check(["postgres:", "postgresql:"].includes(parsed.protocol) &&
  parsed.hostname === "127.0.0.1" && parsed.port === "55921" &&
  parsed.username === "gafus_refactor_local_real" &&
  parsed.pathname === "/gafus_refactor_real_work_20261024", "LOCAL_DATABASE_IDENTITY");
const psql = (sql: string) => execFileSync("/opt/homebrew/bin/psql", [
  "-w", "-X", "-qAt", "-h", socket, "-p", "55921", "-d", "gafus_refactor_real_work_20261024",
  "-v", "ON_ERROR_STOP=1", "-c", sql,
], { encoding: "utf8", timeout: 10_000,
  env: { NODE_ENV: "development", PATH: "/opt/homebrew/bin:/usr/bin:/bin",
    PGCONNECT_TIMEOUT: "3", PGOPTIONS: "-c default_transaction_read_only=on" } }).trim();
check(psql("select current_setting('data_directory')") ===
  root + "/.local-pg-scratch/production_snapshot_20261024/data", "PHYSICAL_CLUSTER");
const before = psql(`select count(*) || ':' ||
  (select count(*) from "FeedMediaAsset") from "FeedPost"`);
const actorJson = psql(`select row_to_json(r) from (
  select id from "User" where role='USER' and "registrationPending"=false order by id limit 1) r`);
const actor = JSON.parse(actorJson) as { id: string };
check(actor?.id && /^[A-Za-z0-9_-]{1,128}$/.test(actor.id), "LOCAL_ACTOR");
process.env.DATABASE_URL = raw;
const [{ prisma }, { createFeedService }] = await Promise.all([
  import("@gafus/prisma"), import("../../../../packages/core/src/services/feed/service"),
]);
try {
  // Fail closed for any sign operation; all preserved legacy keys must simply be omitted.
  const signatures: string[] = [];
  const service = createFeedService({ db: prisma,
    storage: { enabled: true, signCdn: async ({ key }: { key: string; expiresAt: Date }) => {
      check(/^media\/v2\/[A-Za-z0-9_-]+\/v1\/(?:image\/[sml]\.webp|poster\.webp|video\/(?:360|720|1080)\.mp4)$/.test(key), "SIGNED_KEY");
      signatures.push(key);
      return "https://quepraquiecebquomiel.begetcdn.cloud/" + key;
    } } as never, enabled: () => true });
  const data = await service.list(actor.id, { sort: "new", pageSize: 10 });
  check(Array.isArray(data.items) && data.items.length <= 10, "POST_PAGE");
  for (const post of data.items) {
    check(Array.isArray(post.attachments), "MEDIA_SHAPE");
    for (const media of post.attachments) {
      check(!media.mp4Urls || Boolean(media.mp4Urls[360]), "MP4_BASELINE_REQUIRED");
    }
  }
  check(psql(`select count(*) || ':' || (select count(*) from "FeedMediaAsset") from "FeedPost"`) === before,
    "NON_MUTATING_COUNTS");
  console.log("FEED_V2_WORKDB_READONLY_PASS", JSON.stringify({
    postsReturned: data.items.length, signedCurrentAssets: signatures.length,
    priorFixturesPreserved: true, noDatabaseWrites: true,
  }));
} catch (error) {
  // Do not emit SQL, user identifiers, media contents, storage URLs or credentials.
  const safeCode = typeof error === "object" && error && "code" in error &&
    typeof error.code === "string" ? error.code : "UNCLASSIFIED";
  console.error("FEED_V2_WORKDB_READONLY_ERROR", JSON.stringify({
    type: error instanceof Error ? error.name : "unknown", code: safeCode,
  }));
  throw new Error("FEED_V2_WORKDB_READONLY_FAILED");
} finally { await prisma.$disconnect(); }
