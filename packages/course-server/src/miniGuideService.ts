import { prisma } from "@gafus/prisma";
import { resolveMiniGuideAccessTx, resolveMiniGuideTargetTx } from "@gafus/core/services/contentAccess";
import { getGafusSettingsTx, type GafusTx } from "@gafus/core/services/gafus";

/**
 * Catalog response never contains HTML. Author/publisher controls Course.guideContent;
 * read entitlement before exposing the document in a separate protected endpoint.
 */
export async function listGafusMiniGuides(userId: string, now = new Date()) {
  return prisma.$transaction(async tx => {
    const [settings, courses] = await Promise.all([
      getGafusSettingsTx(tx as unknown as GafusTx),
      tx.course.findMany({
        where: {
          isPrivate: false,
          guideContent: { not: null },
        },
        select: {
          id: true, name: true, shortDesc: true, logoImg: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
      }),
    ]);
    const items = await Promise.all(courses.map(async course => {
      const target = await resolveMiniGuideTargetTx(tx as unknown as GafusTx, course.id);
      if (!target) return null;
      const access = await resolveMiniGuideAccessTx(tx as unknown as GafusTx, userId, target, now);
      return {
        courseId: course.id,
        title: course.name,
        description: course.shortDesc,
        imageUrl: course.logoImg,
        unlocked: access.allowed,
        accessSource: access.source,
        expiresAt: access.expiresAt?.toISOString() ?? null,
        canPurchase: access.eligibleForGafus && settings.economyEnabled && settings.spendingEnabled,
        price: settings.miniGuideCost,
      };
    }));
    return items.filter((value): value is NonNullable<typeof value> => value !== null);
  });
}

/**
 * Authorize access before reading protected HTML. Both Web and API use this
 * single server-side transaction rather than duplicating entitlement checks.
 * A missing or forbidden guide returns null without exposing content.
 */
export async function getAuthorizedMiniGuideContent(input: {
  userId: string;
  courseId: string;
  now?: Date;
}): Promise<string | null> {
  return prisma.$transaction(async tx => {
    const target = await resolveMiniGuideTargetTx(tx as unknown as GafusTx, input.courseId);
    if (!target) return null;
    const access = await resolveMiniGuideAccessTx(tx as unknown as GafusTx, input.userId, target, input.now);
    if (!access.allowed) return null;
    const course = await tx.course.findUnique({
      where: { id: input.courseId },
      select: { guideContent: true },
    });
    return course?.guideContent || null;
  });
}
