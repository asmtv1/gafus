/** Refactor WORK database only: synthetic inactive promo code POST/PATCH/GET/archive.
 * No real user data changed, no providers, no production connection.
 * An audit trail of the synthetic test record remains in WORK.
 */
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { prisma } from "@gafus/prisma";
import { generateAccessToken } from "@gafus/auth/jwt";

const report = (...messages: string[]) => process.stdout.write(messages.join(" ") + "\n");
const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const db = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (
  process.env.GAFUS_ADMIN_PROMO_SAFE_WORK === "1" &&
  process.cwd() === ROOT + "/apps/api" &&
  execFileSync("git", ["-C", ROOT, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim() === ROOT &&
  execFileSync("git", ["-C", ROOT, "branch", "--show-current"], { encoding: "utf8" }).trim() === "vite" &&
  db.hostname === "127.0.0.1" && db.port === "55921" &&
  db.pathname === "/gafus_refactor_real_work_20261024" &&
  db.username === "gafus_refactor_local_real" && !!db.password && db.search === "?schema=public" &&
  process.env.GAFUS_LOCAL_ISOLATED_API === "1" &&
  process.env.API_HOST === "127.0.0.1" && process.env.API_PORT === "3001" &&
  process.env.REDIS_URL === "redis://127.0.0.1:55927/1" &&
  (process.env.JWT_SECRET?.length ?? 0) >= 32
) { /* All conditions are mandatory, no fallback. */ }
else throw Error("PROMO_LIVE_WRITE_ISOLATION_GUARD_DENIED");

const base = "http://127.0.0.1:3001/api/v1/admin/app-subscriptions";
const code = `QAADMIN${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString("hex").toUpperCase()}`;
let createdId: string | null = null;
let archived = false;
try {
  const currentDatabase = await prisma.$queryRaw<[{ db: string; role: string }]>`
    SELECT current_database() AS db, current_user AS role`;
  if (currentDatabase[0]?.db !== "gafus_refactor_real_work_20261024" ||
      currentDatabase[0].role !== "gafus_refactor_local_real") throw Error("DB_IDENTITY_DENIED");
  const actor = await prisma.user.findFirst({
    where: { role: "ADMIN", registrationPending: false },
    select: { id: true, username: true, role: true },
  });
  if (!actor) throw Error("LOCAL_WORK_ADMIN_UNAVAILABLE");
  const jwt = await generateAccessToken(actor);
  const request = async (path: string, method = "GET", body?: object) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${jwt}`, Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json() as {
      success?: boolean; data?: Record<string, unknown>; code?: string;
    };
    if (response.status !== 200 || result.success !== true || !result.data)
      throw Error(`PROMO_HTTP_${method}_${response.status}_${result.code ?? "INVALID_ENVELOPE"}`);
    return result.data;
  };
  if (await prisma.appSubscriptionPromoCode.findFirst({ where: { code } })) {
    throw Error("TEST_CODE_COLLISION");
  }
  const created = await request("/promo-codes", "POST", {
    code, discountPercent: 1, isActive: false,
  });
  if (typeof created.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(created.id) ||
    created.code !== code || created.discountPercent !== 1 || created.isActive !== false)
    throw Error("CREATE_RESPONSE_MISMATCH");
  createdId = created.id;
  const first = await prisma.appSubscriptionPromoCode.findUnique({ where: { id: createdId } });
  if (!first || first.code !== code || first.discountPercent !== 1 ||
      first.isActive || first.archivedAt)
    throw Error("CREATE_SQL_READBACK_MISMATCH");
  const visible = await request("?tab=promo-codes");
  if (!Array.isArray(visible.promoCodes) ||
    !visible.promoCodes.some(row => row && typeof row === "object" && "id" in row && row.id === createdId))
    throw Error("CREATE_HTTP_LIST_READBACK_MISMATCH");

  const edited = await request(`/promo-codes/${createdId}`, "PATCH", {
    discountPercent: 2, isActive: false,
  });
  if (edited.discountPercent !== 2 || edited.isActive !== false) throw Error("PATCH_RESPONSE_MISMATCH");
  const updated = await prisma.appSubscriptionPromoCode.findUnique({ where: { id: createdId } });
  if (updated?.discountPercent !== 2 || updated?.isActive !== false)
    throw Error("PATCH_SQL_READBACK_MISMATCH");

  const deleted = await request(`/promo-codes/${createdId}`, "DELETE");
  if (deleted.isActive !== false || !deleted.archivedAt) throw Error("ARCHIVE_RESPONSE_MISMATCH");
  archived = true;
  const final = await prisma.appSubscriptionPromoCode.findUnique({ where: { id: createdId } });
  if (!final?.archivedAt || final.isActive || final.discountPercent !== 2)
    throw Error("ARCHIVE_SQL_READBACK_MISMATCH");
  const archive = await request("?tab=promo-codes&includeArchived=1");
  if (!Array.isArray(archive.promoCodes) ||
    !archive.promoCodes.some(row => row && typeof row === "object" && "id" in row &&
      row.id === createdId && "archivedAt" in row && !!row.archivedAt))
    throw Error("ARCHIVE_HTTP_READBACK_MISMATCH");
  report("LIVE_WORK_SYNTHETIC_INACTIVE_PROMO_CREATE_PATCH_ARCHIVE 3/3 PASS");
} catch (error) {
  report("LIVE_WORK_SYNTHETIC_PROMO_FAILED", error instanceof Error ? error.message : "UNKNOWN");
  process.exitCode = 1;
} finally {
  // Only this test's own synthetic record may be archived; never touch other records.
  if (createdId && !archived) {
    try {
      const value = await prisma.appSubscriptionPromoCode.findUnique({ where: { id: createdId } });
      if (value?.code === code && !value.archivedAt && !value.isActive) {
        // This is not a success receipt: a failure still needs operator inspection.
        report("OWN_DISABLED_TEST_FIXTURE_RETAINED_FOR_RECONCILIATION");
        process.exitCode = 1;
      }
    } catch { report("TEST_FIXTURE_STATUS_UNKNOWN"); process.exitCode = 1; }
  }
  await prisma.$disconnect();
}
