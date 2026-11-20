import {
  readAdminNpdPageRows,
  readRetryNpdReceipt,
  readReconcileNpdReceipt,
  scheduleRetryNpdOperation,
  scheduleNpdReconciliationOperation,
  readAdminSubscriptionDashboardRows,
  readDefaultAdminSubscriptionSettings,
  updateDefaultAdminSubscriptionSettingsRows,
  readAdminUserSubscriptionRows,
  withLockedManualGrantAdmin,
  readCurrentManualGrant,
  updateManualGrantRecord,
  createManualGrantRecord,
  clearActiveManualGrants,
} from "./adminRows.js";
import { DateTime } from "luxon";

import type { AppSubscriptionPlanCode } from "@gafus/subscription-shared/plans";

const APP_SUBSCRIPTION_DASHBOARD_TIMEZONE = "Europe/Moscow";

export type NpdAdminReceiptStatus =
  | "PENDING"
  | "ISSUED"
  | "CANCEL_PENDING"
  | "CANCELED"
  | "RECONCILIATION_REQUIRED"
  | "FAILED";
export type NpdAdminPage = {
  connection: {
    status: "ACTIVE" | "REAUTH_REQUIRED" | "DISABLED" | null;
    fiscalizationStartedAt: string | null;
    lastAuthorizedAt: string | null;
    lastSuccessfulOperationAt: string | null;
    lastErrorCode: string | null;
    lastErrorRedacted: string | null;
  } | null;
  backlog: number;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  items: {
    id: string;
    paymentId: string;
    user: { id: string; username: string; fullName: string | null; email: string | null };
    planCode: string;
    amountRub: number;
    currency: string;
    status: NpdAdminReceiptStatus;
    emailDelivery: string | null;
    retryAt: string | null;
    printUrl: string | null;
    lastErrorRedacted: string | null;
    canRetry: boolean;
    canReconcile: boolean;
    operationAt: string;
  }[];
};

export async function getNpdAdminPage(params: {
  page: number;
  pageSize: number;
  role?: "ADMIN" | "MODERATOR";
  status?: NpdAdminReceiptStatus;
  from?: Date;
  to?: Date;
  search?: string;
}): Promise<NpdAdminPage> {
  const page = Math.max(1, Math.floor(params.page));
  const pageSize = Math.min(100, Math.max(10, Math.floor(params.pageSize)));

  const [connection, total, rows, backlog] = await readAdminNpdPageRows(params, page, pageSize);
  return {
    connection: connection
      ? {
          ...connection,
          fiscalizationStartedAt: connection.fiscalizationStartedAt?.toISOString() ?? null,
          lastAuthorizedAt: connection.lastAuthorizedAt?.toISOString() ?? null,
          lastSuccessfulOperationAt: connection.lastSuccessfulOperationAt?.toISOString() ?? null,
        }
      : null,
    backlog,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    items: rows.map((row) => {
      const op = row.operations.find((item) => item.status !== "NOT_REQUIRED") ?? row.operations[0];
      const retryAt = op?.nextAttemptAt ?? row.emailDelivery?.nextAttemptAt ?? null;
      return {
        id: row.id,
        paymentId: row.paymentId,
        user: {
          id: row.payment.user.id,
          username: row.payment.user.username,
          fullName: row.payment.user.profile?.fullName ?? null,
          email: params.role === "ADMIN" ? row.payment.user.email : null,
        },
        planCode: row.planCode,
        amountRub: row.amountKopecks / 100,
        currency: row.currency,
        status: row.status,
        emailDelivery: row.emailDelivery?.status ?? null,
        retryAt: retryAt?.toISOString() ?? null,
        printUrl: params.role === "ADMIN" ? row.printUrl : null,
        lastErrorRedacted: op?.lastErrorRedacted ?? row.emailDelivery?.lastErrorRedacted ?? null,
        canRetry:
          row.status === "FAILED" && row.operations.some((item) => item.status === "FAILED"),
        canReconcile:
          row.status === "RECONCILIATION_REQUIRED" &&
          row.operations.some(
            (item) =>
              item.status === "RECONCILIATION_REQUIRED" &&
              item.lastErrorCode !== "ADMIN_RECONCILIATION_REQUESTED",
          ),
        operationAt: row.operationAt.toISOString(),
      };
    }),
  };
}

export async function adminRetryNpdReceiptOperation(receiptId: string) {
  const receipt = await readRetryNpdReceipt(receiptId);
  if (!receipt) return { ok: false as const, code: "NOT_FOUND" };
  if (receipt.status === "RECONCILIATION_REQUIRED")
    return { ok: false as const, code: "RECONCILIATION_REQUIRED" };
  // A pending RETRY has already been scheduled. Replaying the admin request must
  // not move nextAttemptAt or accidentally schedule another provider operation.
  const operation = receipt.operations.find((item) => item.status === "FAILED");
  if (!operation) return { ok: false as const, code: "NOT_RETRYABLE" };
  const changed = await scheduleRetryNpdOperation(operation.id);
  // Another operator or worker may have changed the row between read and CAS.
  return changed.count === 1
    ? { ok: true as const }
    : { ok: false as const, code: "NOT_RETRYABLE" };
}

export async function adminQueueNpdReconciliation(receiptId: string) {
  const receipt = await readReconcileNpdReceipt(receiptId);
  if (!receipt || receipt.status !== "RECONCILIATION_REQUIRED")
    return { ok: false as const, code: "NOT_AMBIGUOUS" };
  const operation = receipt.operations.find((item) => item.status === "RECONCILIATION_REQUIRED");
  if (!operation) return { ok: false as const, code: "NOT_AMBIGUOUS" };
  const changed = await scheduleNpdReconciliationOperation(operation.id);
  return changed.count === 1
    ? { ok: true as const }
    : { ok: false as const, code: "NOT_AMBIGUOUS" };
}

export type AppSubscriptionAdminAttention =
  | "not_renewed"
  | "past_due"
  | "cancel_at_period_end"
  | null;

export interface AppSubscriptionAdminDashboardMetrics {
  totalSubscriptions: number;
  activeNow: number;
  notRenewed: number;
  cancelAtPeriodEnd: number;
  pastDue: number;
  lifetime: number;
  totalSucceededPayments: number;
  totalRevenueRub: number;
  todayCheckoutStarted: number;
  todayCheckoutPaid: number;
  todayCheckoutNotPaid: number;
}

export interface AppSubscriptionAdminCheckoutAttempt {
  id: string;
  user: {
    id: string;
    username: string;
    email: string | null;
    phone: string | null;
    fullName: string | null;
  };
  attemptedAt: string;
  attemptsCount: number;
  promoCodeSnapshot: string | null;
  promoDiscountPercent: number | null;
  originalAmountRub: number | null;
  amountRub: number;
  status: "PENDING" | "CANCELED" | "FAILED";
}

export interface AppSubscriptionAdminDashboardRow {
  id: string;
  planCode: AppSubscriptionPlanCode;
  planTitle: string | null;
  user: {
    id: string;
    username: string;
    email: string | null;
    phone: string | null;
    fullName: string | null;
  };
  provider: "YOOKASSA" | "APPLE" | "GOOGLE_PLAY" | "MANUAL";
  status: string;
  isActiveNow: boolean;
  isLifetime: boolean;
  boughtAt: string | null;
  activeUntil: string | null;
  currentPeriodStart: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  lastPaymentAt: string | null;
  paymentsCount: number;
  totalPaidRub: number;
  paymentMethod: string | null;
  appleProductId: string | null;
  apple: {
    productId: string | null;
    originalTransactionId: string | null;
    transactionId: string | null;
    webOrderLineItemId: string | null;
    storefront: string | null;
    environment: string | null;
    currency: string | null;
    price: number | null;
    priceMilliunits: number | null;
    lastServerSyncAt: string | null;
    lastServerSyncStatus: string | null;
  } | null;
  manualReason: string | null;
  attention: AppSubscriptionAdminAttention;
  createdAt: string;
  updatedAt: string;
}

export interface AppSubscriptionAdminDashboard {
  metrics: AppSubscriptionAdminDashboardMetrics;
  todayNotPaid: AppSubscriptionAdminCheckoutAttempt[];
  rows: AppSubscriptionAdminDashboardRow[];
}

type PaymentLike = {
  subscriptionId: string | null;
  userId: string;
  amount: { toString(): string } | number | string | null;
  currency: string | null;
  applePriceMilliunits?: number | null;
  appleTransactionId?: string | null;
  appleOriginalTransactionId?: string | null;
  appleStorefront?: string | null;
  appleEnvironment?: string | null;
  appleWebOrderLineItemId?: string | null;
  succeededAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type AppleSyncEventLike = {
  subscriptionId: string | null;
  eventType: string;
  processedAt: Date | null;
  createdAt: Date;
};

type CheckoutAttemptLike = {
  id: string;
  userId: string;
  status: "PENDING" | "SUCCEEDED" | "CANCELED" | "FAILED" | "REFUNDED";
  amount: { toString(): string } | number | string | null;
  originalAmount: { toString(): string } | number | string | null;
  promoCodeSnapshot: string | null;
  promoDiscountPercent: number | null;
  createdAt: Date;
  user: {
    id: string;
    username: string;
    email: string | null;
    phone: string | null;
    profile: { fullName: string | null } | null;
  };
};

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function moneyToNumber(value: PaymentLike["amount"]): number {
  if (value == null) return 0;
  const numberValue = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function appleMilliunitsToNumber(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Number((value / 1000).toFixed(3));
}

function paymentAmount(payment: PaymentLike): number {
  const amount = moneyToNumber(payment.amount);
  return amount > 0 ? amount : appleMilliunitsToNumber(payment.applePriceMilliunits);
}

function paymentDate(payment: PaymentLike): Date {
  return payment.succeededAt ?? payment.updatedAt ?? payment.createdAt;
}

function isSubscriptionActiveNow(
  row: {
    status: string;
    isLifetime: boolean;
    currentPeriodEnd: Date | null;
  },
  now: Date,
): boolean {
  if (row.status !== "ACTIVE") return false;
  if (row.isLifetime) return true;
  return row.currentPeriodEnd ? row.currentPeriodEnd > now : false;
}

function isNotRenewed(
  row: {
    status: string;
    isLifetime: boolean;
    currentPeriodEnd: Date | null;
  },
  payments: PaymentLike[],
  now: Date,
): boolean {
  if (payments.length === 0) return false;
  if (isSubscriptionActiveNow(row, now)) return false;
  return (
    ["EXPIRED", "CANCELED", "REFUNDED", "REVOKED"].includes(row.status) ||
    (row.status === "ACTIVE" &&
      !row.isLifetime &&
      Boolean(row.currentPeriodEnd && row.currentPeriodEnd <= now))
  );
}

export async function getAppSubscriptionAdminDashboard(
  now = new Date(),
): Promise<AppSubscriptionAdminDashboard> {
  const todayStart = DateTime.fromJSDate(now, { zone: "utc" })
    .setZone(APP_SUBSCRIPTION_DASHBOARD_TIMEZONE)
    .startOf("day")
    .toUTC()
    .toJSDate();
  const tomorrowStart = DateTime.fromJSDate(now, { zone: "utc" })
    .setZone(APP_SUBSCRIPTION_DASHBOARD_TIMEZONE)
    .plus({ days: 1 })
    .startOf("day")
    .toUTC()
    .toJSDate();

  const [subscriptions, succeededPayments, todayInitialPayments, appleSyncEvents] =
    await readAdminSubscriptionDashboardRows(todayStart, tomorrowStart);

  const checkoutAttemptsByUserId = new Map<string, CheckoutAttemptLike[]>();
  for (const attempt of todayInitialPayments as CheckoutAttemptLike[]) {
    const existing = checkoutAttemptsByUserId.get(attempt.userId) ?? [];
    existing.push(attempt);
    checkoutAttemptsByUserId.set(attempt.userId, existing);
  }

  let todayCheckoutPaid = 0;
  const todayNotPaid: AppSubscriptionAdminCheckoutAttempt[] = [];
  for (const attempts of checkoutAttemptsByUserId.values()) {
    if (
      attempts.some((attempt) => attempt.status === "SUCCEEDED" || attempt.status === "REFUNDED")
    ) {
      todayCheckoutPaid += 1;
      continue;
    }

    const latestAttempt = attempts[0];
    if (
      !latestAttempt ||
      latestAttempt.status === "SUCCEEDED" ||
      latestAttempt.status === "REFUNDED"
    ) {
      continue;
    }

    todayNotPaid.push({
      id: latestAttempt.id,
      user: {
        id: latestAttempt.user.id,
        username: latestAttempt.user.username,
        email: latestAttempt.user.email,
        phone: latestAttempt.user.phone,
        fullName: latestAttempt.user.profile?.fullName ?? null,
      },
      attemptedAt: latestAttempt.createdAt.toISOString(),
      attemptsCount: attempts.length,
      promoCodeSnapshot: latestAttempt.promoCodeSnapshot ?? null,
      promoDiscountPercent: latestAttempt.promoDiscountPercent ?? null,
      originalAmountRub:
        latestAttempt.originalAmount == null ? null : moneyToNumber(latestAttempt.originalAmount),
      amountRub: moneyToNumber(latestAttempt.amount),
      status: latestAttempt.status,
    });
  }

  const paymentsBySubscriptionId = new Map<string, PaymentLike[]>();
  for (const payment of succeededPayments as PaymentLike[]) {
    if (!payment.subscriptionId) continue;
    const existing = paymentsBySubscriptionId.get(payment.subscriptionId) ?? [];
    existing.push(payment);
    paymentsBySubscriptionId.set(payment.subscriptionId, existing);
  }

  const latestAppleSyncEventBySubscriptionId = new Map<string, AppleSyncEventLike>();
  for (const event of appleSyncEvents as AppleSyncEventLike[]) {
    if (!event.subscriptionId || latestAppleSyncEventBySubscriptionId.has(event.subscriptionId)) {
      continue;
    }
    latestAppleSyncEventBySubscriptionId.set(event.subscriptionId, event);
  }

  let activeNow = 0;
  let notRenewed = 0;
  let cancelAtPeriodEnd = 0;
  let pastDue = 0;
  let lifetime = 0;
  let totalRevenueRub = 0;

  for (const payment of succeededPayments as PaymentLike[]) {
    if (payment.currency == null || payment.currency === "RUB") {
      totalRevenueRub += paymentAmount(payment);
    }
  }

  const rows = subscriptions.map((subscription) => {
    const payments = paymentsBySubscriptionId.get(subscription.id) ?? [];
    const sortedPayments = [...payments].sort(
      (a, b) => paymentDate(a).getTime() - paymentDate(b).getTime(),
    );
    const firstPayment = sortedPayments[0] ?? null;
    const lastPayment = sortedPayments[sortedPayments.length - 1] ?? null;
    const lastApplePayment =
      [...sortedPayments]
        .reverse()
        .find(
          (payment) =>
            payment.appleTransactionId ||
            payment.appleOriginalTransactionId ||
            payment.applePriceMilliunits != null,
        ) ?? null;
    const latestAppleSyncEvent = latestAppleSyncEventBySubscriptionId.get(subscription.id) ?? null;
    const isActiveNow = isSubscriptionActiveNow(subscription, now);
    const isChurned = isNotRenewed(subscription, payments, now);
    const totalPaidRub = payments.reduce((sum, payment) => {
      if (payment.currency != null && payment.currency !== "RUB") return sum;
      return sum + paymentAmount(payment);
    }, 0);

    if (isActiveNow) activeNow += 1;
    if (isChurned) notRenewed += 1;
    if (subscription.cancelAtPeriodEnd && isActiveNow) cancelAtPeriodEnd += 1;
    if (subscription.status === "PAST_DUE") pastDue += 1;
    if (subscription.isLifetime) lifetime += 1;

    const attention: AppSubscriptionAdminAttention =
      subscription.status === "PAST_DUE"
        ? "past_due"
        : isChurned
          ? "not_renewed"
          : subscription.cancelAtPeriodEnd && isActiveNow
            ? "cancel_at_period_end"
            : null;
    const boughtAt =
      firstPayment != null
        ? paymentDate(firstPayment)
        : (subscription.currentPeriodStart ?? subscription.createdAt ?? null);

    return {
      id: subscription.id,
      planCode: subscription.planCode,
      planTitle: subscription.planTitle,
      user: {
        id: subscription.user.id,
        username: subscription.user.username,
        email: subscription.user.email,
        phone: subscription.user.phone,
        fullName: subscription.user.profile?.fullName ?? null,
      },
      provider: subscription.provider,
      status: subscription.status,
      isActiveNow,
      isLifetime: subscription.isLifetime,
      boughtAt: toIso(boughtAt),
      activeUntil: toIso(subscription.currentPeriodEnd),
      currentPeriodStart: toIso(subscription.currentPeriodStart),
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      canceledAt: toIso(subscription.canceledAt),
      lastPaymentAt: lastPayment ? toIso(paymentDate(lastPayment)) : null,
      paymentsCount: payments.length,
      totalPaidRub,
      paymentMethod:
        subscription.provider === "APPLE"
          ? "Apple"
          : (subscription.yookassaPaymentMethodTitle ??
            (subscription.yookassaPaymentMethodLast4
              ? `Карта *${subscription.yookassaPaymentMethodLast4}`
              : null)),
      appleProductId: subscription.appleProductId,
      apple:
        subscription.provider === "APPLE"
          ? {
              productId: subscription.appleProductId,
              originalTransactionId:
                subscription.appleOriginalTransactionId ??
                lastApplePayment?.appleOriginalTransactionId ??
                null,
              transactionId: lastApplePayment?.appleTransactionId ?? null,
              webOrderLineItemId: lastApplePayment?.appleWebOrderLineItemId ?? null,
              storefront: lastApplePayment?.appleStorefront ?? null,
              environment: lastApplePayment?.appleEnvironment ?? null,
              currency: lastApplePayment?.currency ?? null,
              price: lastApplePayment ? paymentAmount(lastApplePayment) : null,
              priceMilliunits: lastApplePayment?.applePriceMilliunits ?? null,
              lastServerSyncAt: latestAppleSyncEvent
                ? toIso(latestAppleSyncEvent.processedAt ?? latestAppleSyncEvent.createdAt)
                : null,
              lastServerSyncStatus:
                latestAppleSyncEvent?.eventType.replace(/^SERVER_SYNC:/, "") ?? null,
            }
          : null,
      manualReason: subscription.manualReason,
      attention,
      createdAt: subscription.createdAt.toISOString(),
      updatedAt: subscription.updatedAt.toISOString(),
    };
  });

  return {
    metrics: {
      totalSubscriptions: rows.length,
      activeNow,
      notRenewed,
      cancelAtPeriodEnd,
      pastDue,
      lifetime,
      totalSucceededPayments: (succeededPayments as PaymentLike[]).length,
      totalRevenueRub,
      todayCheckoutStarted: checkoutAttemptsByUserId.size,
      todayCheckoutPaid,
      todayCheckoutNotPaid: todayNotPaid.length,
    },
    todayNotPaid,
    rows,
  };
}

export async function getDefaultAppSubscriptionSettings() {
  return readDefaultAdminSubscriptionSettings();
}

export async function updateDefaultAppSubscriptionSettings(params: {
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
  return updateDefaultAdminSubscriptionSettingsRows(params);
}

export async function getUserAppSubscriptionAdminSummary(userId: string) {
  const [status, rows] = await readAdminUserSubscriptionRows(userId);

  return {
    hasActiveSubscription: Boolean(status && (status.isLifetime || status.currentPeriodEnd)),
    provider: status?.provider ?? null,
    status: status?.status ?? null,
    isLifetime: Boolean(status?.isLifetime),
    activeUntil: status?.currentPeriodEnd ? status.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: Boolean(status?.cancelAtPeriodEnd),
    manualRecord: rows[0] ?? null,
  };
}

/** Lock both sides of a manual grant before checking staff authority or modifying access.
 * It also serializes concurrent grants to the same account, so two concurrent
 * admins cannot both create an active MANUAL row after seeing none.
 */

export async function adminGrantPaidUntil(params: {
  userId: string;
  adminUserId: string;
  paidUntil: Date;
  reason?: string;
}) {
  const periodStart = new Date();
  const periodEnd = params.paidUntil;
  if (periodEnd <= periodStart) throw new Error("paidUntil должен быть в будущем");

  return withLockedManualGrantAdmin(params.adminUserId, params.userId, async (tx) => {
    const existing = await readCurrentManualGrant(tx, params.userId);
    if (existing) {
      await updateManualGrantRecord(tx, existing.id, {
        status: "ACTIVE",
        isLifetime: false,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        manualGrantedById: params.adminUserId,
        manualReason: params.reason ?? null,
      });
    } else {
      await createManualGrantRecord(tx, {
        userId: params.userId,
        provider: "MANUAL",
        status: "ACTIVE",
        isLifetime: false,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        manualGrantedById: params.adminUserId,
        manualReason: params.reason ?? null,
      });
    }
  });
}

export async function adminGrantLifetime(params: {
  userId: string;
  adminUserId: string;
  reason?: string;
}) {
  return withLockedManualGrantAdmin(params.adminUserId, params.userId, async (tx) => {
    const existing = await readCurrentManualGrant(tx, params.userId);
    if (existing) {
      await updateManualGrantRecord(tx, existing.id, {
        status: "ACTIVE",
        isLifetime: true,
        currentPeriodStart: new Date(),
        currentPeriodEnd: null,
        manualGrantedById: params.adminUserId,
        manualReason: params.reason ?? null,
      });
    } else {
      await createManualGrantRecord(tx, {
        userId: params.userId,
        provider: "MANUAL",
        status: "ACTIVE",
        isLifetime: true,
        currentPeriodStart: new Date(),
        currentPeriodEnd: null,
        manualGrantedById: params.adminUserId,
        manualReason: params.reason ?? null,
      });
    }
  });
}

export async function adminClearManualGrant(params: { userId: string; adminUserId: string }) {
  return withLockedManualGrantAdmin(params.adminUserId, params.userId, async (tx) => {
    await clearActiveManualGrants(tx, params.userId, params.adminUserId);
  });
}
