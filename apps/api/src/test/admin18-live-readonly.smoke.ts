/** Restricted, read-only smoke against the existing local Refactor Hono (3001)
 * and the independent WORK PostgreSQL copy. Never logs DTOs, IDs, PII or JWTs.
 * No writes, no provider sends, no production network.
 */
import { execFileSync } from "node:child_process";
import { prisma } from "@gafus/prisma";
import { generateAccessToken } from "@gafus/auth/jwt";

const report = (...messages: string[]) => process.stdout.write(messages.join(" ") + "\n");
const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const db = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
const expected = {
  hostname: "127.0.0.1", port: "55921",
  pathname: "/gafus_refactor_real_work_20261024",
  username: "gafus_refactor_local_real",
};
if (
  process.env.GAFUS_ADMIN18_LIVE_READONLY !== "1" ||
  process.cwd() !== ROOT + "/apps/api" ||
  execFileSync("git", ["-C", ROOT, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim() !== ROOT ||
  execFileSync("git", ["-C", ROOT, "branch", "--show-current"], { encoding: "utf8" }).trim() !== "vite" ||
  Object.entries(expected).some(([key, value]) => db[key as keyof URL] !== value) ||
  !db.password || db.search !== "?schema=public" ||
  process.env.GAFUS_LOCAL_ISOLATED_API !== "1" ||
  process.env.GAFUS_LOCAL_BROWSER_AUTH !== "1" ||
  process.env.API_HOST !== "127.0.0.1" ||
  process.env.API_PORT !== "3001" ||
  process.env.REDIS_URL !== "redis://127.0.0.1:55927/1" ||
  !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32
) throw Error("ADMIN18_READONLY_ISOLATION_GUARD_DENIED");

const sections: readonly [string, string, boolean][] = [
  ["feed-moderation", "/api/v1/admin/moderation/feed/reports", true],
  ["questions", "/api/v1/admin/moderation/questions/reports", false],
  ["users", "/api/v1/admin/users", true],
  ["mail", "/api/v1/admin/mail", false],
  ["media", "/api/v1/admin/media/stats", false],
  ["admin", "/api/v1/admin/settings/subscriptions", true],
  ["partners", "/api/v1/admin/partners", false],
  ["profit", "/api/v1/admin/profit", false],
  ["feature-flags", "/api/v1/admin/feature-flags", true],
  ["broadcasts", "/api/v1/admin/broadcasts/preview", false],
  ["reengagement", "/api/v1/admin/analytics/reengagement", false],
  ["rewarded-ads", "/api/v1/admin/analytics/rewarded-ads?days=30", false],
  ["gafus", "/api/v1/gafus/admin/dashboard", false],
  ["mobile-intro", "/api/v1/mobile-intro/admin/report?" + new URLSearchParams({
    start: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    end: new Date(Date.now() + 86_400_000).toISOString(),
  }), false],
  ["app-subscriptions", "/api/v1/admin/app-subscriptions", true],
  ["consultations", "/api/v1/consultations/admin/cynologists", false],
  ["bookings", "/api/v1/consultations/admin/bookings", false],
  ["trainers-schedules", "/api/v1/consultations/admin/cynologists", false],
];
// Additional Next/Vite secondary GET scenarios; never perform any write.
const secondaryReadOnly: readonly [string, string, boolean][] = [
  ["cache", "/api/v1/admin/cache", true],
  ["mail-alerts", "/api/v1/admin/mail/alerts", false],
  ["gafus-fraud", "/api/v1/admin/gafus-operations/fraud", false],
  ["gafus-preflight", "/api/v1/admin/gafus-operations/legacy/preflight", false],
  ["promo-archived", "/api/v1/admin/app-subscriptions?tab=promo-codes&includeArchived=1", true],
  ["npd-pending", "/api/v1/admin/app-subscriptions?tab=npd&npdStatus=PENDING", true],
  ["payment-page2", "/api/v1/admin/app-subscriptions?tab=payments&paymentPage=2&paymentPageSize=10", true],
  ["profit-period", "/api/v1/admin/profit?from=2026-10-01&to=2026-10-15&paymentPage=2&videoPage=1", false],
  ["questions-page2", "/api/v1/admin/moderation/questions/reports?page=2", false],
  ["rewarded-week", "/api/v1/admin/analytics/rewarded-ads?days=7", false],
];
const result = await prisma.$queryRaw<[{ db: string; actor: string }]>`
  SELECT current_database() AS db, current_user AS actor`;
if (result[0]?.db !== "gafus_refactor_real_work_20261024" ||
    result[0].actor !== "gafus_refactor_local_real") {
  throw Error("ADMIN18_READONLY_DATABASE_IDENTITY_DENIED");
}
const roles = ["ADMIN", "MODERATOR", "USER"] as const;
let problems = 0;
try {
  for (const role of roles) {
    const user = await prisma.user.findFirst({
      where: { role, registrationPending: false },
      select: { id: true, username: true, role: true },
    });
    if (!user) { report(`${role} LOCAL_WORK_ACTOR_ABSENT`); problems++; continue; }
    const jwt = await generateAccessToken(user);
    let pass = 0;
    for (const [key, endpoint, moderatorCanRead] of sections) {
      const want = role === "ADMIN" || (role === "MODERATOR" && moderatorCanRead) ? 200 : 403;
      let got: number | string = "HTTP_UNREACHABLE";
      try {
        const response = await fetch(`http://127.0.0.1:3001${endpoint}`, {
          method: "GET", headers: { Authorization: `Bearer ${jwt}`, Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        got = response.status;
        // Only check envelope; never print, persist or render personal data.
        const payload: unknown = await response.json().catch(() => null);
        if (got === 200 &&
          (!payload || typeof payload !== "object" || !("success" in payload) ||
            payload.success !== true || !("data" in payload))) got = "BAD_ENVELOPE";
      } catch { /* deliberately omit transport details / auth headers */ }
      if (got === want) pass++;
      else {
        problems++;
        report(`${role} ${key}: expected ${want}, got ${got}`);
      }
    }
    report(`LIVE_WORK_${role}_READONLY ${pass}/${sections.length}`);
    let secondaryPass = 0;
    for (const [key, endpoint, moderatorCanRead] of secondaryReadOnly) {
      const want = role === "ADMIN" || (role === "MODERATOR" && moderatorCanRead) ? 200 : 403;
      let got: number | string = "HTTP_UNREACHABLE";
      try {
        const response = await fetch(`http://127.0.0.1:3001${endpoint}`, {
          method: "GET", headers: { Authorization: `Bearer ${jwt}`, Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        got = response.status;
        if (got === 200) {
          const value: unknown = await response.json().catch(() => null);
          if (!value || typeof value !== "object" || !("success" in value) ||
              value.success !== true || !("data" in value)) got = "BAD_ENVELOPE";
        }
      } catch { /* read-only transport failure */ }
      if (got === want) secondaryPass++;
      else { problems++; report(`${role} SECONDARY ${key}: expected ${want}, got ${got}`); }
    }
    report(`LIVE_WORK_${role}_SECONDARY_GET ${secondaryPass}/${secondaryReadOnly.length}`);

  }
} finally {
  await prisma.$disconnect();
}
if (problems) process.exitCode = 1;
