import { prisma } from "@gafus/prisma";
import type { ChatDisplayRole } from "@gafus/consultation-shared";

/** Display only project staff roles and current paid subscriptions. */
export async function getChatDisplayRole(
  user: { id: string; role: string },
  now = new Date(),
): Promise<ChatDisplayRole | null> {
  if (user.role === "ADMIN") return "admin";
  if (user.role === "TRAINER") return "trainer";
  const subscription = await prisma.appSubscription.findFirst({
    where: {
      userId: user.id,
      status: "ACTIVE",
      OR: [{ isLifetime: true }, { currentPeriodEnd: { gt: now } }],
      payments: { some: { status: "SUCCEEDED", amount: { gt: 0 } } },
    },
    select: { id: true },
  });
  return subscription ? "subscriber" : null;
}
