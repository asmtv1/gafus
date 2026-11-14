/* SQL adapter: admin finance reads and serializable manual-grant operations. */

import { Prisma, prisma } from "@gafus/prisma";

export type FinanceAdminGrantTx = Prisma.TransactionClient;

export type NpdAdminReceiptStatus =
  | "PENDING"
  | "ISSUED"
  | "CANCEL_PENDING"
  | "CANCELED"
  | "RECONCILIATION_REQUIRED"
  | "FAILED";

export type NpdPageQuery = {
  status?: NpdAdminReceiptStatus;
  from?: Date;
  to?: Date;
  search?: string;
};

export async function readAdminNpdPageRows(params: NpdPageQuery, page: number, pageSize: number) {
  const search = params.search?.trim();

  const where: Prisma.NpdReceiptWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.from || params.to
      ? {
          operationAt: {
            ...(params.from ? { gte: params.from } : {}),
            ...(params.to ? { lt: params.to } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { id: { contains: search, mode: "insensitive" } },
            { paymentId: { contains: search, mode: "insensitive" } },
            { payment: { yookassaPaymentId: { contains: search, mode: "insensitive" } } },
            { payment: { user: { username: { contains: search, mode: "insensitive" } } } },
            { payment: { user: { email: { contains: search, mode: "insensitive" } } } },
            {
              payment: {
                user: { profile: { fullName: { contains: search, mode: "insensitive" } } },
              },
            },
          ],
        }
      : {}),
  };

  const select = {
    id: true,
    paymentId: true,
    amountKopecks: true,
    currency: true,
    planCode: true,
    status: true,
    operationAt: true,
    printUrl: true,
    payment: {
      select: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
      },
    },
    operations: {
      select: {
        type: true,
        status: true,
        nextAttemptAt: true,
        lastErrorCode: true,
        lastErrorRedacted: true,
      },
      orderBy: { updatedAt: "desc" as const },
    },
    emailDelivery: { select: { status: true, nextAttemptAt: true, lastErrorRedacted: true } },
  } as const;

  const [connection, total, rows, backlog] = await Promise.all([
    prisma.npdConnection.findUnique({
      where: { id: "default" },
      select: {
        status: true,
        fiscalizationStartedAt: true,
        lastAuthorizedAt: true,
        lastSuccessfulOperationAt: true,
        lastErrorCode: true,
        lastErrorRedacted: true,
      },
    }),
    prisma.npdReceipt.count({ where }),
    prisma.npdReceipt.findMany({
      where,
      orderBy: [{ operationAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select,
    }),
    prisma.npdReceiptOperation.count({
      where: { status: { in: ["PENDING", "PROCESSING", "RETRY"] } },
    }),
  ]);

  return [connection, total, rows, backlog] as const;
}

export async function readAdminSubscriptionDashboardRows(todayStart: Date, tomorrowStart: Date) {
  const [subscriptions, succeededPayments, todayInitialPayments, appleSyncEvents] =
    await Promise.all([
      prisma.appSubscription.findMany({
        orderBy: [{ updatedAt: "desc" }],
        select: {
          id: true,
          provider: true,
          status: true,
          planCode: true,
          planTitle: true,
          isLifetime: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          canceledAt: true,
          yookassaPaymentMethodLast4: true,
          yookassaPaymentMethodTitle: true,
          appleOriginalTransactionId: true,
          appleProductId: true,
          manualReason: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              phone: true,
              profile: { select: { fullName: true } },
            },
          },
        },
      }),
      prisma.appSubscriptionPayment.findMany({
        where: { status: "SUCCEEDED" },
        orderBy: [{ succeededAt: "desc" }, { updatedAt: "desc" }],
        select: {
          subscriptionId: true,
          userId: true,
          amount: true,
          originalAmount: true,
          promoCodeSnapshot: true,
          promoDiscountPercent: true,
          currency: true,
          applePriceMilliunits: true,
          appleTransactionId: true,
          appleOriginalTransactionId: true,
          appleStorefront: true,
          appleEnvironment: true,
          appleWebOrderLineItemId: true,
          kind: true,
          succeededAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.appSubscriptionPayment.findMany({
        where: {
          provider: "YOOKASSA",
          kind: "INITIAL",
          createdAt: { gte: todayStart, lt: tomorrowStart },
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          userId: true,
          status: true,
          amount: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              phone: true,
              profile: { select: { fullName: true } },
            },
          },
        },
      }),
      prisma.appSubscriptionEvent.findMany({
        where: {
          source: "APPLE",
          eventType: { startsWith: "SERVER_SYNC:" },
        },
        orderBy: [{ processedAt: "desc" }, { createdAt: "desc" }],
        select: {
          subscriptionId: true,
          eventType: true,
          processedAt: true,
          createdAt: true,
        },
      }),
    ]);

  return [subscriptions, succeededPayments, todayInitialPayments, appleSyncEvents] as const;
}

export async function readAdminUserSubscriptionRows(userId: string) {
  const [status, rows] = await Promise.all([
    prisma.appSubscription.findFirst({
      where: {
        userId,
        status: { in: ["ACTIVE", "PENDING", "PAST_DUE"] },
      },
      orderBy: [{ isLifetime: "desc" }, { currentPeriodEnd: "desc" }],
      select: {
        provider: true,
        status: true,
        isLifetime: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
      },
    }),
    prisma.appSubscription.findMany({
      where: { userId, provider: "MANUAL" },
      orderBy: [{ updatedAt: "desc" }],
      take: 1,
      select: {
        id: true,
        status: true,
        isLifetime: true,
        currentPeriodEnd: true,
        manualReason: true,
      },
    }),
  ]);

  return [status, rows] as const;
}

export function readRetryNpdReceipt(receiptId: string) {
  return prisma.npdReceipt.findUnique({
    where: { id: receiptId },
    select: { status: true, operations: { select: { id: true, type: true, status: true } } },
  });
}

export function readReconcileNpdReceipt(receiptId: string) {
  return prisma.npdReceipt.findUnique({
    where: { id: receiptId },
    select: { status: true, operations: { select: { id: true, status: true } } },
  });
}

export function scheduleRetryNpdOperation(operationId: string) {
  return prisma.npdReceiptOperation.updateMany({
    where: { id: operationId, status: "FAILED" },
    data: {
      status: "RETRY",
      nextAttemptAt: new Date(),
      completedAt: null,
      lastErrorCode: null,
      lastErrorRedacted: null,
    },
  });
}

export function scheduleNpdReconciliationOperation(operationId: string) {
  return prisma.npdReceiptOperation.updateMany({
    where: {
      id: operationId,
      status: "RECONCILIATION_REQUIRED",
      OR: [{ lastErrorCode: null }, { lastErrorCode: { not: "ADMIN_RECONCILIATION_REQUESTED" } }],
    },
    data: {
      lastErrorCode: "ADMIN_RECONCILIATION_REQUESTED",
      lastErrorRedacted: "Сверка запрошена администратором; внешняя проверка недоступна",
    },
  });
}

export function readDefaultAdminSubscriptionSettings() {
  return prisma.appSubscriptionSettings.findUnique({
    where: { key: "default" },
  });
}

export function updateDefaultAdminSubscriptionSettingsRows(params: {
  twoWeeksEnabled: boolean;
  yookassaTwoWeeksPriceRub: number;
  twoWeeksIntervalDays: number;
  monthlyEnabled: boolean;
  yookassaMonthlyPriceRub: number;
  monthlyIntervalDays: number;
  threeMonthsEnabled: boolean;
  yookassaThreeMonthsPriceRub: number;
  threeMonthsIntervalDays: number;
  monthlyAppleProductId: string | null;
  actorId: string;
}) {
  return prisma.$transaction(async (tx) => {
    // Serialize price updates with concurrent role revocation.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${params.actorId} FOR UPDATE`;
    const actor = await tx.user.findUnique({
      where: { id: params.actorId },
      select: { role: true },
    });
    if (actor?.role !== "ADMIN") throw new Error("FORBIDDEN");
    return tx.appSubscriptionSettings.upsert({
      where: { key: "default" },
      create: {
        key: "default",
        twoWeeksEnabled: params.twoWeeksEnabled,
        yookassaTwoWeeksPriceRub: params.yookassaTwoWeeksPriceRub,
        twoWeeksIntervalDays: params.twoWeeksIntervalDays,
        monthlyEnabled: params.monthlyEnabled,
        yookassaMonthlyPriceRub: params.yookassaMonthlyPriceRub,
        monthlyIntervalDays: params.monthlyIntervalDays,
        threeMonthsEnabled: params.threeMonthsEnabled,
        yookassaThreeMonthsPriceRub: params.yookassaThreeMonthsPriceRub,
        threeMonthsIntervalDays: params.threeMonthsIntervalDays,
        monthlyAppleProductId: params.monthlyAppleProductId,
        updatedById: params.actorId,
      },
      update: {
        // Legacy weekly settings are deliberately absent from this payload: switching
        // public YooKassa offers must not alter subscriptions still using WEEKLY.
        twoWeeksEnabled: params.twoWeeksEnabled,
        yookassaTwoWeeksPriceRub: params.yookassaTwoWeeksPriceRub,
        twoWeeksIntervalDays: params.twoWeeksIntervalDays,
        monthlyEnabled: params.monthlyEnabled,
        yookassaMonthlyPriceRub: params.yookassaMonthlyPriceRub,
        monthlyIntervalDays: params.monthlyIntervalDays,
        threeMonthsEnabled: params.threeMonthsEnabled,
        yookassaThreeMonthsPriceRub: params.yookassaThreeMonthsPriceRub,
        threeMonthsIntervalDays: params.threeMonthsIntervalDays,
        monthlyAppleProductId: params.monthlyAppleProductId,
        updatedById: params.actorId,
      },
    });
  });
}

export async function withLockedManualGrantAdmin<T>(
  adminUserId: string,
  userId: string,
  action: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${adminUserId}, ${userId}) ORDER BY "id" FOR UPDATE`;
      const [actor, target] = await Promise.all([
        tx.user.findUnique({ where: { id: adminUserId }, select: { role: true } }),
        tx.user.findUnique({ where: { id: userId }, select: { id: true } }),
      ]);
      if (actor?.role !== "ADMIN") throw new Error("FORBIDDEN");
      if (!target) throw new Error("USER_NOT_FOUND");
      return action(tx);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export function readCurrentManualGrant(tx: FinanceAdminGrantTx, userId: string) {
  return tx.appSubscription.findFirst({
    where: {
      userId: userId,
      provider: "MANUAL",
      status: { in: ["ACTIVE", "PENDING", "PAST_DUE"] },
    },
    select: { id: true },
  });
}

export function updateManualGrantRecord(
  tx: FinanceAdminGrantTx,
  id: string,
  data: Prisma.AppSubscriptionUncheckedUpdateInput,
) {
  return tx.appSubscription.update({ where: { id }, data });
}

export function createManualGrantRecord(
  tx: FinanceAdminGrantTx,
  data: Prisma.AppSubscriptionUncheckedCreateInput,
) {
  return tx.appSubscription.create({ data });
}

export function clearActiveManualGrants(
  tx: FinanceAdminGrantTx,
  userId: string,
  adminUserId: string,
) {
  return tx.appSubscription.updateMany({
    where: {
      userId: userId,
      provider: "MANUAL",
      status: { in: ["ACTIVE", "PENDING", "PAST_DUE"] },
    },
    data: {
      status: "CANCELED",
      canceledAt: new Date(),
      manualGrantedById: adminUserId,
    },
  });
}
