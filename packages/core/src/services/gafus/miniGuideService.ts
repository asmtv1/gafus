import { prisma } from "@gafus/prisma";
import { resolveMiniGuideAccessTx, resolveMiniGuideTargetTx } from "../contentAccess";
import { getGafusSettingsTx } from "./settingsService";

/**
 * Catalog response never contains HTML. Author/publisher controls Course.guideContent;
 * read entitlement before exposing the document in a separate protected endpoint.
 */
export async function listGafusMiniGuides(userId: string, now = new Date()) {
  return prisma.$transaction(async tx => {
    const [settings, courses] = await Promise.all([
      getGafusSettingsTx(tx),
      tx.course.findMany({
        where: {
          isPaid: false,
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
      const target = await resolveMiniGuideTargetTx(tx, course.id);
      if (!target) return null;
      const access = await resolveMiniGuideAccessTx(tx, userId, target, now);
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
