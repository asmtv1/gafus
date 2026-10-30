import { Hono } from "hono";
import { prisma } from "@gafus/prisma";
import { getCourseCacheMetricsSnapshot } from "@gafus/core/services/training";
import { requireRole } from "../../middleware/auth.js";

/** Hono/Vite cache boundary: Next revalidateTag only works inside Next. */
export const adminCacheRoutes = new Hono();
adminCacheRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});

async function staffRole(actorId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: actorId }, select: { role: true },
  });
  return actor?.role;
}
adminCacheRoutes.get("/", requireRole("ADMIN", "MODERATOR"), async c => {
  try {
    const role = await staffRole(c.get("user").id);
    if (role !== "ADMIN" && role !== "MODERATOR") {
      return c.json({ success: false, code: "FORBIDDEN" }, 403);
    }
    return c.json({ success: true, data: {
      scope: "HONO_COURSE_CONTENT",
      allNextTagsSupported: false,
      courseRevisionSource: "POSTGRESQL",
      processMetrics: getCourseCacheMetricsSnapshot(),
      explanation: "Vite/Hono uses no-store reads; Next cache tags cannot be invalidated from Hono",
    } });
  } catch { return c.json({ success: false, code: "CACHE_STATS_UNAVAILABLE" }, 503); }
});

adminCacheRoutes.post("/courses/refresh", requireRole("ADMIN", "MODERATOR"), async c => {
  const payload = await c.req.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).length !== 1 ||
      payload.confirmation !== "REFRESH_COURSE_CONTENT") {
    return c.json({ success: false, code: "CONFIRMATION_REQUIRED" }, 400);
  }
  try {
    // The postgres revision is authoritative for every course-day process cache.
    // Lock actor before mutation: a demoted MODERATOR must not retain rights.
    const rows = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${c.get("user").id} FOR UPDATE`;
      const actor = await tx.user.findUnique({
        where: { id: c.get("user").id }, select: { role: true },
      });
      if (actor?.role !== "ADMIN" && actor?.role !== "MODERATOR") {
        throw new Error("FORBIDDEN");
      }
      return tx.$queryRaw<{ revision: bigint }[]>`
        UPDATE "CourseContentRevision" SET "revision" = "revision" + 1
        WHERE "id" = 1 RETURNING "revision"
      `;
    });
    if (rows.length !== 1 || typeof rows[0]?.revision !== "bigint") {
      return c.json({ success: false, code: "CACHE_REVISION_MISSING" }, 503);
    }
    return c.json({ success: true, data: {
      refreshed: true, revision: rows[0].revision.toString(),
      scope: "HONO_COURSE_CONTENT",
    } });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return c.json({ success: false, code: "FORBIDDEN" }, 403);
    }
    return c.json({ success: false, code: "CACHE_REFRESH_FAILED" }, 503);
  }
});
