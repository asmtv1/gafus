"use server";

import { prisma } from "@gafus/prisma";

import type { PushSubscriptionJSON, PushSubscriptionKeys } from "@gafus/types";

export async function getUserSubscriptions(userId: string): Promise<PushSubscriptionJSON[]> {
  const records = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  return records
    .map((r: { endpoint: string; keys: { p256dh: string; auth: string } }) => {
      const keysRaw = r.keys as unknown;

      // Проверка структуры вручную
      if (
        keysRaw &&
        typeof keysRaw === "object" &&
        !Array.isArray(keysRaw) &&
        "p256dh" in keysRaw &&
        "auth" in keysRaw &&
        typeof (keysRaw as PushSubscriptionKeys).p256dh === "string" &&
        typeof (keysRaw as PushSubscriptionKeys).auth === "string"
      ) {
        const keys = keysRaw as PushSubscriptionKeys;

        return {
          endpoint: r.endpoint,
          keys: {
            p256dh: keys.p256dh,
            auth: keys.auth,
          },
        } as PushSubscriptionJSON;
      }

      return null;
    })
    .filter((sub): sub is PushSubscriptionJSON => sub !== null);
}
