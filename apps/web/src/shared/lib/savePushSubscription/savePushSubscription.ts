"use server";

import { getServerSession } from "next-auth";
import type { NextAuthOptions } from "next-auth";
import { z } from "zod";
import { savePushSubscription as savePushSubscriptionInCore } from "@gafus/core/services/subscriptions";
import { existsUser, getUserIdByUsername } from "@gafus/core/services/user";
import { authOptions } from "@gafus/auth";

import type { PushSubscriptionJSON } from "@gafus/types";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

const pushSubscriptionSchema = z.object({
  endpoint: z.string().trim().min(1, "endpoint обязателен"),
  keys: z.object({
    p256dh: z.string().trim().min(1, "p256dh обязателен"),
    auth: z.string().trim().min(1, "auth обязателен"),
  }),
});

/**
 * Сохраняет подписку в БД через core. Fallback по username при несуществующем userId.
 */
export async function savePushSubscription(subscription: PushSubscriptionJSON) {
  const validatedSubscription = pushSubscriptionSchema.parse(subscription);
  let userId = await getCurrentUserId();

  if (!(await existsUser(userId))) {
    const session = await getServerSession(authOptions as NextAuthOptions);
    const byUsername = session?.user?.username
      ? await getUserIdByUsername(session.user.username)
      : null;
    if (byUsername) {
      userId = byUsername;
    } else {
      throw new Error(`Пользователь с ID ${userId} не найден в базе данных`);
    }
  }

  return savePushSubscriptionInCore({
    userId,
    endpoint: validatedSubscription.endpoint,
    keys: validatedSubscription.keys,
  });
}
