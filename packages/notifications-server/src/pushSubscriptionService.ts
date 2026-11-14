/**
 * Push Subscription Service - бизнес-логика работы с push-подписками
 *
 * Этот модуль содержит чистую бизнес-логику без Next.js специфики.
 */

import { prisma, isPrismaUniqueConstraintError, type PushSubscription } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("push-subscription-service");

// ========== Save Push Subscription ==========

/** No raw endpoint, push keys or principal identifiers in error messages/logs. */
export class PushEndpointOwnerConflictError extends Error {
  readonly code = "PUSH_ENDPOINT_OWNER_CONFLICT";
  constructor() {
    super("Push endpoint is bound to another active owner");
    this.name = "PushEndpointOwnerConflictError";
  }
}

export class PushSessionStaleError extends Error {
  readonly code = "PUSH_SESSION_STALE";
  constructor() {
    super("Push registration session is no longer current");
    this.name = "PushSessionStaleError";
  }
}

interface SavePushSubscriptionParams {
  /** Always from a verified server session, NEVER from request JSON. */
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Signed JWT authenticatedAt, obtained after authMiddleware validates JWT. */
  verifiedSessionAuthenticatedAtMs?: number;
}

/**
 * Atomic endpoint binding: serialized by PG advisory transaction lock.
 * Unlike global endpoint update(userId), a foreign active owner is NEVER silently
 * replaced. The previous owner must explicitly unregister the endpoint or
 * delete their account before a different owner can register it.
 *
 * The old NextAuth direct Core caller has no verified signed JWT issue time:
 * it can operate only while its User.sessionsRevokedAt is NULL. After a global
 * revocation it fails closed until its transport supplies verified server time.
 * No authEpoch/userId value supplied in request JSON can authorize a transfer.
 */
export async function savePushSubscription(
  params: SavePushSubscriptionParams,
): Promise<PushSubscription> {
  const { userId, endpoint, keys, verifiedSessionAuthenticatedAtMs } = params;
  logger.info("Push subscription registration requested");

  const signedEpochPresent = verifiedSessionAuthenticatedAtMs !== undefined;
  if (signedEpochPresent &&
    (!Number.isSafeInteger(verifiedSessionAuthenticatedAtMs) ||
      verifiedSessionAuthenticatedAtMs <= 0)) throw new PushSessionStaleError();

  try {
    return await prisma.$transaction(async (tx) => {
      // All AG1 writers lock the same endpoint in all Hono instances. Hash
      // collisions only serialize unrelated endpoints; never merge their data.
      await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(7160250, hashtext(${endpoint}))`;
      // Lock the User row: logout/credential-revoke updates cannot race a
      // successful registration after this check but before COMMIT.
      const rows = await tx.$queryRaw<{
        id: string; sessionsRevokedAt: Date | null; registrationPending: boolean;
      }[]>`
        SELECT "id", "sessionsRevokedAt", "registrationPending"
        FROM "User" WHERE "id" = ${userId} FOR UPDATE
      `;
      const actor = rows[0];
      if (!actor || actor.registrationPending ||
          (actor.sessionsRevokedAt &&
            (!signedEpochPresent ||
              verifiedSessionAuthenticatedAtMs <= actor.sessionsRevokedAt.getTime()))) {
        throw new PushSessionStaleError();
      }
      const existing = await tx.pushSubscription.findUnique({ where: { endpoint } });
      if (!existing) {
        return tx.pushSubscription.create({ data: { userId, endpoint, keys } });
      }
      // Never transfer an active/old binding on POST: the endpoint alone is
      // not proof of device ownership. Owner A must explicitly unregister
      // (or its account must be removed) before B can CREATE a new binding.
      if (existing.userId !== userId) throw new PushEndpointOwnerConflictError();
      const changed = await tx.pushSubscription.updateMany({
        where: { id: existing.id, endpoint, userId: existing.userId },
        data: { userId, keys, updatedAt: new Date() },
      });
      if (changed.count !== 1) throw new PushEndpointOwnerConflictError();
      const winner = await tx.pushSubscription.findUnique({ where: { endpoint } });
      if (!winner || winner.userId !== userId) throw new PushEndpointOwnerConflictError();
      return winner;
    });
  } catch (error) {
    // Other writers with an old package can still insert the same @unique
    // endpoint. Convert their P2002 to a sanitized deterministic conflict.
    if (isPrismaUniqueConstraintError(error)) throw new PushEndpointOwnerConflictError();
    throw error;
  }
}

// ========== Delete Push Subscription ==========

/**
 * Удаляет push-подписку по endpoint
 */
export async function deletePushSubscriptionByEndpoint(
  userId: string,
  endpoint: string,
): Promise<{ success: boolean; deletedCount: number }> {
  logger.info("Push subscription deletion requested");

  const result = await prisma.pushSubscription.deleteMany({
    where: {
      userId,
      endpoint,
    },
  });

  logger.info("Deleted subscriptions", { deletedCount: result.count });
  return { success: true, deletedCount: result.count };
}

/**
 * Удаляет ВСЕ push-подписки пользователя
 */
export async function deleteAllPushSubscriptions(
  userId: string,
): Promise<{ success: boolean; deletedCount: number }> {
  logger.info("All push subscriptions deletion requested");

  const result = await prisma.pushSubscription.deleteMany({
    where: { userId },
  });

  logger.info("Deleted subscriptions", { deletedCount: result.count });
  return { success: true, deletedCount: result.count };
}

// ========== Get Subscription Status ==========

/**
 * Проверяет, есть ли у пользователя активные push-подписки и отдельно — Expo (мобильное приложение).
 * Веб-подписка без Expo не должна блокировать регистрацию токена на телефоне.
 */
export async function getUserSubscriptionStatus(
  userId: string,
): Promise<{ hasSubscription: boolean; hasExpoPushSubscription: boolean }> {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { endpoint: true },
  });

  const hasSubscription = subscriptions.length > 0;
  const hasExpoPushSubscription = subscriptions.some(
    (s) =>
      s.endpoint.startsWith("ExponentPushToken[") || s.endpoint.startsWith("ExpoPushToken["),
  );

  return { hasSubscription, hasExpoPushSubscription };
}

/** Ответ проверки подписки для переданных endpoint'ов (текущее устройство). */
export interface PushSubscriptionDeviceStatus {
  /** Есть ли в БД запись с одним из переданных endpoint для этого пользователя */
  hasThisDeviceSubscription: boolean;
  /** false, если клиент прислал пустой список — сверить с БД нельзя */
  determined: boolean;
}

/**
 * Проверяет, зарегистрированы ли на сервере push-endpoint'ы этого устройства.
 * Пустой список: determined=false (нет токена с устройства — статус «неизвестен»).
 */
export async function getPushSubscriptionStatusForEndpoints(
  userId: string,
  endpoints: string[],
): Promise<PushSubscriptionDeviceStatus> {
  if (endpoints.length === 0) {
    return { hasThisDeviceSubscription: false, determined: false };
  }

  const count = await prisma.pushSubscription.count({
    where: {
      userId,
      endpoint: { in: endpoints },
    },
  });

  return {
    hasThisDeviceSubscription: count > 0,
    determined: true,
  };
}

/**
 * Получает количество активных push-подписок пользователя
 */
export async function getUserSubscriptionCount(
  userId: string,
): Promise<{ subscriptionCount: number }> {
  const count = await prisma.pushSubscription.count({
    where: { userId },
  });

  return { subscriptionCount: count };
}

/**
 * Получает список всех подписок пользователя
 */
export async function getUserSubscriptions(userId: string) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
    select: {
      id: true,
      endpoint: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return { subscriptions };
}
