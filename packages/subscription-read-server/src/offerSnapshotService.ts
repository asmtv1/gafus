/** Read-side only: the paywall GET must never initialize an Apple identity. */
import { prisma } from "@gafus/prisma";

export async function getSubscriptionOfferDbSnapshot(authenticatedOwnerId: string) {
  if (!authenticatedOwnerId) throw new Error("SUBSCRIPTION_OFFER_OWNER_REQUIRED");
  const [settings, owner] = await Promise.all([
    prisma.appSubscriptionSettings.findUnique({
      where: { key: "default" },
      select: {
        weeklyEnabled: true,
        twoWeeksEnabled: true,
        monthlyEnabled: true,
        threeMonthsEnabled: true,
        yookassaWeeklyPriceRub: true,
        yookassaTwoWeeksPriceRub: true,
        yookassaMonthlyPriceRub: true,
        yookassaThreeMonthsPriceRub: true,
        currency: true,
        weeklyIntervalDays: true,
        twoWeeksIntervalDays: true,
        monthlyIntervalDays: true,
        threeMonthsIntervalDays: true,
        weeklyAppleProductId: true,
        monthlyAppleProductId: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: authenticatedOwnerId },
      select: {
        appleAppAccountToken: true,
        savedRegistrationPromoCode: {
          select: { code: true, isActive: true, archivedAt: true },
        },
      },
    }),
  ]);
  return {
    settings,
    // Null stays null: the only writer is the explicit owner-scoped POST.
    appleAppAccountToken: owner?.appleAppAccountToken ?? null,
    savedRegistrationPromoCode: owner?.savedRegistrationPromoCode ?? null,
  };
}
