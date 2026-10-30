import { Hono } from "hono";
import type {
  PublicCourseCatalogItem,
  PublicCourseCatalogResponse,
} from "../../../../../packages/types/src/data/course";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-public-courses");
export const publicCoursesRoutes = new Hono();

/**
 * Anonymous catalog projection. Never return course day links, reviews,
 * private courses, user progress, identifiers of enrolled users or entitlement
 * records. Authenticated requests continue to use /api/v1/courses.
 */
publicCoursesRoutes.get("/", async (c) => {
  try {
    // Registering the anonymous route must not load the entire Course Core barrel.
    // Load the existing real producer only for an actual GET, retaining the same
    // Prisma whitelist, errors and cache headers. No alternate producer is added.
    const { getPublicCoursesCatalog } = await import("@gafus/core/services/course");
    const publicCatalog: PublicCourseCatalogItem[] = await getPublicCoursesCatalog();
    return c.json(
      { success: true, data: publicCatalog } satisfies PublicCourseCatalogResponse,
      200,
      {
        "Cache-Control": "public, max-age=60",
      },
    );
  } catch {
    // DB/provider errors can include private account data and credentials.
    // Keep the operational signal without forwarding the raw Error/stack.
    logger.error("Anonymous courses listing failed");
    return c.json({ success: false, error: "Не удалось загрузить каталог" }, 500, {
      "Cache-Control": "no-store",
    });
  }
});
