/** AG4 lease guard. One-shot claim written INSIDE owned scratch on --test. Never executes Vitest/Prisma/DB. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const ID = "G1-CORE-DB-OVERRIDE-AG1-20261016-03";
const PATH = path.join(ROOT, "apps/admin-panel/AG4_G1_CORE_DB_OVERRIDE_LEASE_03.json");
const PREFIX = path.join(ROOT, "apps/api");
const MODES = ["--prepare", "--test", "--cleanup"];
function stop(reason) { throw new Error("AG4_DB_OVERRIDE_SCOPE_STOP:" + reason); }
const mode = process.argv[2];
if (!MODES.includes(mode) || process.argv.length !== 3) stop("INVALID_MODE");
if (fs.realpathSync(ROOT) !== ROOT) stop("WRONG_ROOT");
const leaseFile = fs.lstatSync(PATH);
if (!leaseFile.isFile() || leaseFile.isSymbolicLink()) stop("LEASE_FILE_UNSAFE");
const lease = JSON.parse(fs.readFileSync(PATH, "utf8"));
if (lease.id !== ID || lease.state !== "ACTIVE" ||
    lease.phase !== "SINGLE_CORE_DB_OVERRIDE_NON_DB_ONLY" || lease.executor !== "AG1" ||
    lease.root !== ROOT || lease.branch !== "vite") stop("LEASE_WRONG_STATE_OR_SCOPE");
const started = Date.parse(lease.startAtUTC);
const until = Date.parse(lease.expiresAtUTC);
if (!Number.isFinite(started) || !Number.isFinite(until) ||
    Date.now() < started || Date.now() >= until || until <= started) stop("LEASE_EXPIRED");
const scratch = lease.scratchPath;
if (typeof scratch !== "string" || path.dirname(scratch) !== PREFIX ||
    !/^\.g1-core-override\.[a-z0-9]{8,32}$/.test(path.basename(scratch)) ||
    path.normalize(scratch) !== scratch) stop("SCRATCH_INVALID");
if (lease.testPath !== path.join(scratch, "scratch-db-override.proof.test.ts") ||
    lease.configPath !== path.join(scratch, "scratch-vitest.config.ts") ||
    lease.mockPath !== path.join(scratch, "scratch-prisma-mock.ts")) stop("TEST_PATHS_INVALID");
if (lease.databaseURL !== "postgresql://g1@127.0.0.1:55442/gafus_consultation_limit_test_ag4override261016") stop("LEASE_DB_URL");
if (process.env.G1_AG4_ACTIVE_LEASE_ID !== ID) stop("LEASE_TOKEN");
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== lease.databaseURL) stop("DANGEROUS_DATABASE_URL");
if (process.env.NODE_PATH || process.env.NODE_OPTIONS) stop("UNSAFE_NODE_IMPORT_ENV");
const cwd = process.cwd();
if (mode === "--test" && (cwd !== scratch || fs.realpathSync(cwd) !== scratch)) stop("TEST_CWD_NOT_SCRATCH");
if (mode !== "--test" && cwd !== scratch && cwd !== ROOT) stop("CWD_OUTSIDE_APPROVED_ROOT_OR_SCRATCH");
let current = ROOT;
for (const segment of path.relative(ROOT, scratch).split(path.sep)) {
 current = path.join(current, segment);
 if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) stop("SCRATCH_SYMLINK");
}
if (fs.existsSync(scratch)) {
 const marker = path.join(scratch, ".g1-owner");
 if (!fs.existsSync(marker) || fs.lstatSync(marker).isSymbolicLink() ||
     fs.readFileSync(marker,"utf8").trim() !== "CORE-DB-OVERRIDE-TEST-TEMP-ONLY") stop("SCRATCH_OWNER");
}
if (mode === "--test") {
 for (const relative of [
    "node_modules", "node_modules/.vite-temp", "cache/vite",
    "scratch-vitest.config.ts", "scratch-db-override.proof.test.ts", "scratch-prisma-mock.ts"
 ]) {
    const file = path.join(scratch, relative);
    if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) stop("MISSING_OR_SYMLINK:" + relative);
    if (["node_modules", "node_modules/.vite-temp", "cache/vite"].includes(relative) &&
        !fs.lstatSync(file).isDirectory()) stop("SCRATCH_CACHE_NOT_DIRECTORY");
 }
 if (fs.existsSync(path.join(scratch, "generated")) || fs.existsSync(path.join(scratch, "schema.prisma"))) stop("PRISMA_GENERATION_FORBIDDEN");
 const test = fs.readFileSync(lease.testPath,"utf8");
 const config = fs.readFileSync(lease.configPath,"utf8");
 if (!test.includes("getConsultationBookingEligibility") ||
     !test.includes("findFirst") ||
     !test.includes("consultationBooking") ||
     !config.includes("scratch-prisma-mock.ts")) stop("INJECTED_TEST_ADAPTER_MISSING");
 if (test.includes("vi.spyOn") || test.includes("$connect") ||
     test.includes("PrismaClient") || test.includes("prisma generate")) stop("FORBIDDEN_TEST_INSTRUMENTATION");
 const man = JSON.parse(fs.readFileSync(path.join(ROOT,"apps/api/G1_PRISMA_SHARED_BASELINE_MANIFEST.json"),"utf8")).paths_sha256;
 if (Object.keys(man).length !== 145) stop("SHARED_HASH_MANIFEST_COUNT");
 for (const [relative, expected] of Object.entries(man)) {
    let p = ROOT;
    for (const segment of relative.split("/")) {
      p = path.join(p, segment);
      if (fs.lstatSync(p).isSymbolicLink()) stop("SHARED_SYMLINK");
    }
    const actual = createHash("sha256").update(fs.readFileSync(p)).digest("hex");
    if (actual !== expected) stop("SHARED_HASH_DRIFT:" + relative);
 }
 // Claim exactly ONE test attempt. AG1 must invoke --test precisely once immediately before Vitest.
 // Open with wx to fail closed on a second attempt, even under the same still-active lease.
 const oneTestClaim = path.join(scratch, ".g1-one-test-claimed");
 try {
   fs.writeFileSync(oneTestClaim, new Date().toISOString() + "\n", {flag:"wx", mode:0o600});
 } catch {
   stop("SINGLE_TEST_ALREADY_CLAIMED");
 }
}
console.log(JSON.stringify({ id: ID, phase:lease.phase, mode, expiry:lease.expiresAtUTC,
 scratch, allowsOneCoreMockTest:true, allowsPrismaGenerate:false,
 allowsDatabaseConnection:false, allowsMigrations:false }));
