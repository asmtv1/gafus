/**
 * Anonymous catalog: one narrow, read-only public Course projection.
 * Keep authenticated course progress/entitlement work in courseService.
 */
import { prisma } from "@gafus/prisma";
import type { Prisma } from "@gafus/prisma";
import type { PublicCourseCatalogItem } from "../../../../types/src/data/course";
import { publicCourseCoverUrl } from "../../../../types/src/data/publicCourseCover";

const publicCatalogSelect = {
  id: true,
  name: true,
  type: true,
  shortDesc: true,
  logoImg: true,
  duration: true,
  isPaid: true,
  trainingLevel: true,
} satisfies Prisma.CourseSelect;

/**
 * Existing /api/v1/public/courses wire semantics:
 * no profile visibility filter, no invented orderBy, no actor/plan lookup.
 * isPrivate is guaranteed false by the database predicate.
 */
export async function getPublicCoursesCatalog(): Promise<PublicCourseCatalogItem[]> {
  const courses = await prisma.course.findMany({
    where: { isPrivate: false },
    select: publicCatalogSelect,
  });

  return courses.map((course): PublicCourseCatalogItem => ({
    id: course.id,
    name: course.name,
    type: course.type,
    shortDesc: course.shortDesc,
    ...(() => {
      const logoImg = publicCourseCoverUrl(course.logoImg);
      return logoImg ? { logoImg } : {};
    })(),
    duration: course.duration,
    isPaid: course.isPaid,
    isPrivate: false,
    hasAccess: !course.isPaid,
    isFavorite: false,
    userStatus: "NOT_STARTED",
    trainingLevel: course.trainingLevel,
  }));
}
