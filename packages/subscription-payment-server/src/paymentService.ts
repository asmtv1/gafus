import { enrichPaymentFinance } from "./paymentFinanceService";
import {
  hashAdvisoryLockKey,
  getYookassaPaymentMethodDisplayTitle,
  normalizeFingerprintPart,
  amountsEqual,
  mapAppleServerStatus,
  applePaymentStatus,
} from "./paymentPure";
import { createHmac, randomUUID } from "node:crypto";
import { Prisma, prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { AppStoreServerAPIClient, SignedDataVerifier, Type } from "@apple/app-store-server-library";
import { createAppleProvider } from "./appleProvider";
import { parseAppleTransactionPeriod } from "./appleTransactionPeriod";
import { selectAppleSyncOwner } from "./appleSyncOwner";
import { persistVerifiedAppleServerState, persistVerifiedApplePurchase } from "./appleSubscriptionState";
import {
  activateYookassaPaymentMethodSubscription as activateYookassaTrialSubscription,
  cancelYookassaAutorenewal,
  expireYookassaPendingSubscription,
  applyVerifiedYookassaPayment,
  applyVerifiedYookassaCancellation,
  applyVerifiedYookassaRefund,
  recordInitialYookassaCheckoutFailure,
  attachInitialYookassaCheckoutResponse,
} from "./subscriptionTransitions";
import {
  YookassaHttpError,
  type YooKassaPaymentMethodObject,
  getYookassaPaymentMethodInactiveReason,
  assertYookassaPaymentConfirmed,
  assertYookassaPaymentCanceled,
  assertYookassaPaymentMethodActive,
  fetchYookassaPaymentObject,
  fetchYookassaRefundObject,
  fetchYookassaPaymentMethodObject,
} from "./yookassaProvider";
import { getAppSubscriptionAccess } from "@gafus/subscription-read-server";
import {
  findAppSubscriptionPlanByAppleProductId,
  findAppSubscriptionPlanConfig,
  getAppSubscriptionPlanConfig,
  isPromoEligibleAppSubscriptionPlanCode,
  isPublicAppSubscriptionPlanCode,
  normalizeAppSubscriptionPlanCode,
  type AppSubscriptionPlanCode,
} from "./plans";
import { calculateAppSubscriptionPromoPrice, parseAppSubscriptionPromoCode } from "./promoCode";
import { canReplayInitialCheckout, frozenCheckoutIntervalDays } from "./checkoutReplay";
import type { ClientAppContext } from "@gafus/feature-flags-server/appFeatureFlagsService";
/** Subscription payment engine: provider verification, SQL state transitions,
 * refund and entitlement atomics are server owned. Core injects only
 * feature-gated promo acceptance and its exact public error class. */
export type AppSubscriptionPromoCodeDomainErrorCode =
  | "PROMO_CODE_INVALID_FORMAT"
  | "PROMO_CODE_INVALID_DISCOUNT"
  | "PROMO_CODE_DUPLICATE"
  | "PROMO_CODE_NOT_FOUND"
  | "PROMO_CODE_ARCHIVED"
  | "PROMO_CODE_INACTIVE"
  | "PROMO_CODE_NOT_ELIGIBLE"
  | "PROMO_CODE_FEATURE_DISABLED"
  | "PROMO_CODE_CHANGED"
  | "PROMO_CHECKOUT_IN_PROGRESS"
  | "SUBSCRIPTION_ALREADY_ACTIVE"
  | "SUBSCRIPTION_CHECKOUT_IN_PROGRESS"
  | "PROMO_PLAN_NOT_ELIGIBLE";
export interface PaymentServicePorts {
  AppSubscriptionPromoCodeDomainError: new (
    code: AppSubscriptionPromoCodeDomainErrorCode,
    message: string,
  ) => Error & { readonly code: AppSubscriptionPromoCodeDomainErrorCode };
  isAppSubscriptionPromoCodeEntryEnabled: (context?: ClientAppContext) => Promise<boolean>;
}
export function createPaymentService({
  AppSubscriptionPromoCodeDomainError,
  isAppSubscriptionPromoCodeEntryEnabled,
}: PaymentServicePorts) {
  const logger = createWebLogger("app-subscription-payment-service");
  const YOOKASSA_API = "https://api.yookassa.ru/v3/payments";
  const YOOKASSA_REFUNDS_API = "https://api.yookassa.ru/v3/refunds";
  const YOOKASSA_PENDING_SETUP_TTL_MS = 60 * 60 * 1000;
  const YOOKASSA_START_LOCK_NAMESPACE = 90210018;
  const { getAppleVerifier, getAppleServerApiClient } = createAppleProvider();

  function isAutoRenewableType(type: unknown): boolean {
    return type === Type.AUTO_RENEWABLE_SUBSCRIPTION || type === "Auto-Renewable Subscription";
  }

  function isPrismaUniqueViolation(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    );
  }

  function getYookassaPaymentMethodFingerprintSecret(fallbackSecret?: string): string | null {
    const explicit = process.env.APP_SUBSCRIPTION_CARD_FINGERPRINT_SECRET?.trim();
    if (explicit) return explicit;
    const fallback = fallbackSecret?.trim();
    if (fallback) return fallback;
    const yookassaSecret = process.env.YOOKASSA_SECRET_KEY?.trim();
    return yookassaSecret || null;
  }

  function getYookassaPaymentMethodFingerprintHash(params: {
    providerPaymentMethod: YooKassaPaymentMethodObject;
    fallbackSecret?: string;
  }): string | null {
    const method = params.providerPaymentMethod;
    if (method.type !== "bank_card" || !method.card) return null;

    const card = method.card;
    const parts = [
      normalizeFingerprintPart(card.first6),
      normalizeFingerprintPart(card.last4),
      normalizeFingerprintPart(card.expiry_month),
      normalizeFingerprintPart(card.expiry_year),
      normalizeFingerprintPart(card.card_type, "lower"),
      normalizeFingerprintPart(card.issuer_country, "upper"),
      normalizeFingerprintPart(card.issuer_name, "lower"),
    ];
    const hasRequiredParts = parts.slice(0, 6).every((part) => part.length > 0);
    if (!hasRequiredParts) return null;

    const secret = getYookassaPaymentMethodFingerprintSecret(params.fallbackSecret);
    if (!secret) return null;

    return createHmac("sha256", secret).update(JSON.stringify(parts)).digest("hex");
  }

  function isYookassaPendingSetupExpired(params: {
    pendingExpiresAt?: Date | null;
    now: Date;
  }): boolean {
    return params.pendingExpiresAt instanceof Date && params.pendingExpiresAt <= params.now;
  }


  async function activateYookassaPaymentMethodSubscription(params: {
    subscription: {
      id: string;
      userId: string;
      status: string;
      isLifetime?: boolean | null;
      currentPeriodStart?: Date | null;
      currentPeriodEnd?: Date | null;
    };
    paymentMethodId: string;
    providerPaymentMethod: YooKassaPaymentMethodObject;
    fingerprintSecret?: string;
  }) {
    // Provider-specific validation, hashing and display remain outside SQL persistence.
    const paymentMethodFingerprintHash = getYookassaPaymentMethodFingerprintHash({
      providerPaymentMethod: params.providerPaymentMethod,
      fallbackSecret: params.fingerprintSecret,
    });
    const paymentMethodDisplayTitle = getYookassaPaymentMethodDisplayTitle({
      type: params.providerPaymentMethod.type,
      title: params.providerPaymentMethod.title,
      last4: params.providerPaymentMethod.card?.last4,
    });
    return activateYookassaTrialSubscription({
      subscription: params.subscription,
      paymentMethodId: params.paymentMethodId,
      paymentMethodLast4: params.providerPaymentMethod.card?.last4,
      paymentMethodFingerprintHash,
      paymentMethodDisplayTitle,
    });
  }

  async function startInitialYookassaAppSubscriptionPayment(params: {
    userId: string;
    shopId: string;
    secretKey: string;
    subscriptionId: string;
    preparedPayment: NonNullable<PreparedInitialCheckout["payment"]>;
  }): Promise<
    | { success: true; localSubscriptionId: string; confirmationUrl: string }
    | { success: false; error: string }
  > {
    const payment = params.preparedPayment;
    const idempotenceKey = payment.idempotenceKey;
    const chargedAmountRub = payment.amountRub;
    if (!Number.isFinite(chargedAmountRub) || chargedAmountRub <= 0)
      throw new Error("CHECKOUT_FROZEN_AMOUNT_INVALID");
    const body = {
      amount: { value: chargedAmountRub.toFixed(2), currency: payment.currency },
      capture: true,
      save_payment_method: true,
      // Do not force a method: YooKassa shows the methods enabled for the shop,
      // including SBP and bank cards. A chosen card is saved for renewals.
      confirmation: { type: "redirect" as const, return_url: payment.returnUrl },
      description:
        `Подписка Gafus Premium ${chargedAmountRub.toFixed(2)} ` +
        `${payment.currency}/${payment.intervalDays} дн.`,
      metadata: {
        kind: "app_subscription",
        localPaymentId: payment.id,
        userId: params.userId,
        subscriptionId: params.subscriptionId,
        planCode: payment.planCode,
        initial: "true",
        ...(payment.promoCodeSnapshot
          ? {
              promoCode: payment.promoCodeSnapshot,
              promoDiscountPercent: String(payment.promoDiscountPercent),
            }
          : {}),
      },
    };

    const auth = Buffer.from(`${params.shopId}:${params.secretKey}`).toString("base64");
    let res: Response;
    try {
      res = await fetch(YOOKASSA_API, {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
          "Idempotence-Key": idempotenceKey,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      logger.error("YooKassa initial payment request failed (app subscription)", error as Error);
      await recordInitialYookassaCheckoutFailure({
        paymentId: payment.id, subscriptionId: params.subscriptionId, attemptCount: payment.attemptCount,
        code: "NETWORK", reason: "YooKassa request failed", definitive: false,
      });
      return { success: false, error: "Ошибка соединения с платёжной системой" };
    }

    if (!res.ok) {
      const text = await res.text();
      logger.error(
        "YooKassa rejected app subscription initial payment",
        new Error(`${res.status}: ${text}`),
      );
      await recordInitialYookassaCheckoutFailure({
        paymentId: payment.id, subscriptionId: params.subscriptionId, attemptCount: payment.attemptCount,
        code: "YOOKASSA_REJECTED", reason: "YooKassa HTTP " + res.status,
        // Timeout, conflict, rate limit and 5xx cannot prove no charge.
        definitive: payment.attemptCount === 1 && [400, 401, 403, 404, 422].includes(res.status),
      });
      return { success: false, error: "Платёжная система отклонила запрос" };
    }

    const data = (await res.json().catch(() => null)) as {
      id?: string;
      confirmation?: { confirmation_url?: string };
    } | null;
    const yookassaPaymentId = data?.id ?? null;
    const confirmationUrl = data?.confirmation?.confirmation_url ?? null;
    if (!yookassaPaymentId || !confirmationUrl) {
      logger.error(
        "YooKassa initial payment response has no id/confirmation_url",
        new Error(JSON.stringify(data)),
      );
      await recordInitialYookassaCheckoutFailure({
        paymentId: payment.id, subscriptionId: params.subscriptionId, attemptCount: payment.attemptCount,
        code: "BAD_RESPONSE", reason: "Missing payment id or confirmation URL", definitive: false,
      });
      return { success: false, error: "Неверный ответ платёжной системы" };
    }

    const attached = await attachInitialYookassaCheckoutResponse({
      paymentId: payment.id, subscriptionId: params.subscriptionId,
      providerId: yookassaPaymentId, confirmationUrl,
    });
    if (!attached) return { success: false, error: "Статус оплаты изменился. Проверьте подписку." };

    return { success: true, localSubscriptionId: params.subscriptionId, confirmationUrl };
  }

  type RequestedAppSubscriptionPromoCode = { code: string; revision: number };

  type AppSubscriptionCheckoutErrorCode =
    | AppSubscriptionPromoCodeDomainErrorCode
    | "SUBSCRIPTION_ALREADY_ACTIVE"
    | "SUBSCRIPTION_CHECKOUT_IN_PROGRESS"
    | "PLAN_NOT_AVAILABLE"
    | "SUBSCRIPTION_EMAIL_REQUIRED";

  type PreparedInitialCheckout = {
    subscription: { id: string; status: string; isLifetime: boolean; currentPeriodEnd: Date | null; yookassaPaymentMethodId: string | null };
    payment: {
      id: string;
      idempotenceKey: string;
      amountRub: number;
      currency: string;
      intervalDays: number;
      planCode: AppSubscriptionPlanCode;
      returnUrl: string;
      attemptCount: number;
      promoCodeSnapshot: string | null;
      promoDiscountPercent: number | null;
    } | null;
    reusedConfirmationUrl: string | null;
  };

  async function prepareInitialYookassaCheckout(params: {
    userId: string;
    planCode: AppSubscriptionPlanCode;
    originalAmountRub: number;
    planTitle: string;
    currency: string;
    intervalDays: number;
    promoCode?: RequestedAppSubscriptionPromoCode;
    clientContext?: ClientAppContext;
    buyerEmail: string;
    returnUrl: string;
    now: Date;
  }): Promise<PreparedInitialCheckout> {
    const lockKey = hashAdvisoryLockKey(`app-subscription:yookassa:start:${params.userId}`);
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${YOOKASSA_START_LOCK_NAMESPACE}, ${lockKey})`,
      );

      let promo: {
        id: string;
        code: string;
        discountPercent: number;
        revision: number;
      } | null = null;
      let amountRub = new Prisma.Decimal(params.originalAmountRub).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      let requestedPromoIdentity: ReturnType<typeof parseAppSubscriptionPromoCode> = null;

      if (params.promoCode) {
        if (!(await isAppSubscriptionPromoCodeEntryEnabled(params.clientContext))) {
          throw new AppSubscriptionPromoCodeDomainError(
            "PROMO_CODE_FEATURE_DISABLED",
            "Промокоды недоступны в этой версии приложения",
          );
        }
        requestedPromoIdentity = parseAppSubscriptionPromoCode(params.promoCode.code);
        if (!requestedPromoIdentity) {
          throw new AppSubscriptionPromoCodeDomainError(
            "PROMO_CODE_INVALID_FORMAT",
            "Некорректный формат промокода",
          );
        }
      }

      const pending = await tx.appSubscriptionPayment.findFirst({
        where: {
          userId: params.userId,
          provider: "YOOKASSA",
          kind: "INITIAL",
          status: "PENDING",
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          subscriptionId: true,
          idempotenceKey: true,
          amount: true,
          planCode: true,
          promoCodeId: true,
          promoCodeSnapshot: true,
          promoDiscountPercent: true,
          confirmationUrl: true,
          yookassaCheckoutReturnUrl: true,
          currency: true, periodStart: true, periodEnd: true,
          createdAt: true, lastAttemptAt: true, attemptCount: true,
        },
      });
      const pendingPromoIdentity = pending?.promoCodeSnapshot
        ? parseAppSubscriptionPromoCode(pending.promoCodeSnapshot)
        : null;
      const sameFrozenSnapshot = params.promoCode
        ? pendingPromoIdentity?.normalizedCode === requestedPromoIdentity?.normalizedCode
        : pending?.promoCodeId == null && pending?.promoCodeSnapshot == null;
      if (pending) {
        if (
          pending.planCode === params.planCode &&
          sameFrozenSnapshot &&
          pending.subscriptionId
        ) {
          const subscription = await tx.appSubscription.findUniqueOrThrow({
            where: { id: pending.subscriptionId },
            select: {
              id: true,
              status: true,
              isLifetime: true,
              currentPeriodEnd: true,
              yookassaPaymentMethodId: true,
            },
          });
          if (pending.confirmationUrl) {
            return { subscription, payment: null, reusedConfirmationUrl: pending.confirmationUrl };
          }
          const intervalDays = frozenCheckoutIntervalDays(pending.periodStart, pending.periodEnd);
          const amount = Number(pending.amount);
          if (subscription.status === "PENDING" && intervalDays && pending.currency &&
              pending.yookassaCheckoutReturnUrl && Number.isFinite(amount) && amount > 0 &&
              canReplayInitialCheckout({
                idempotenceKey: pending.idempotenceKey, returnUrl: pending.yookassaCheckoutReturnUrl,
                createdAt: pending.createdAt, lastAttemptAt: pending.lastAttemptAt,
                attemptCount: pending.attemptCount, now: params.now,
              })) {
            const claim = await tx.appSubscriptionPayment.updateMany({
              where: { id: pending.id, provider: "YOOKASSA", status: "PENDING",
                attemptCount: pending.attemptCount, confirmationUrl: null },
              data: { attemptCount: { increment: 1 }, lastAttemptAt: params.now, nextAttemptAt: params.now },
            });
            if (claim.count === 1) return {
              subscription, reusedConfirmationUrl: null,
              payment: {
                id: pending.id, idempotenceKey: pending.idempotenceKey, amountRub: amount,
                currency: pending.currency, intervalDays, planCode: pending.planCode,
                returnUrl: pending.yookassaCheckoutReturnUrl, attemptCount: pending.attemptCount + 1,
                promoCodeSnapshot: pending.promoCodeSnapshot, promoDiscountPercent: pending.promoDiscountPercent,
              },
            };
          }
        }
        throw new AppSubscriptionPromoCodeDomainError(
          "SUBSCRIPTION_CHECKOUT_IN_PROGRESS",
          "У вас уже есть незавершённая оплата",
        );
      }

      const activeSubscription = await tx.appSubscription.findFirst({
        where: {
          userId: params.userId,
          status: "ACTIVE",
          OR: [{ isLifetime: true }, { currentPeriodEnd: { gt: params.now } }],
        },
        select: { id: true, status: true, isLifetime: true, currentPeriodEnd: true },
      });
      if (
        activeSubscription?.status === "ACTIVE" &&
        (activeSubscription.isLifetime ||
          (activeSubscription.currentPeriodEnd instanceof Date &&
            activeSubscription.currentPeriodEnd > params.now))
      ) {
        throw new AppSubscriptionPromoCodeDomainError(
          "SUBSCRIPTION_ALREADY_ACTIVE",
          "У вас уже есть активная подписка. Новый тариф будет доступен после окончания текущего периода",
        );
      }

      if (params.promoCode && requestedPromoIdentity) {
        if (!isPromoEligibleAppSubscriptionPlanCode(params.planCode)) {
          throw new AppSubscriptionPromoCodeDomainError(
            "PROMO_PLAN_NOT_ELIGIBLE",
            "Промокод доступен только для тарифов от 1 месяца",
          );
        }
        const priorSuccessfulPayment = await tx.appSubscriptionPayment.findFirst({
          where: {
            userId: params.userId,
            provider: "YOOKASSA",
            OR: [{ status: { in: ["SUCCEEDED", "REFUNDED"] } }, { succeededAt: { not: null } }],
          },
          select: { id: true },
        });
        if (priorSuccessfulPayment) {
          throw new AppSubscriptionPromoCodeDomainError(
            "PROMO_CODE_NOT_ELIGIBLE",
            "Промокод доступен только до первой успешной оплаты Premium через ЮKassa",
          );
        }
        const row = await tx.appSubscriptionPromoCode.findUnique({
          where: { normalizedCode: requestedPromoIdentity.normalizedCode },
          select: {
            id: true,
            code: true,
            discountPercent: true,
            isActive: true,
            revision: true,
            archivedAt: true,
          },
        });
        if (!row || row.archivedAt) {
          throw new AppSubscriptionPromoCodeDomainError(
            "PROMO_CODE_NOT_FOUND",
            "Промокод не найден",
          );
        }
        if (!row.isActive) {
          throw new AppSubscriptionPromoCodeDomainError("PROMO_CODE_INACTIVE", "Промокод выключен");
        }
        if (row.revision !== params.promoCode.revision) {
          throw new AppSubscriptionPromoCodeDomainError(
            "PROMO_CODE_CHANGED",
            "Условия промокода изменились. Примените его повторно",
          );
        }
        promo = row;
        amountRub = calculateAppSubscriptionPromoPrice(
          params.originalAmountRub,
          row.discountPercent,
        ).discountedPrice;
      }

      const existingSubscription = await tx.appSubscription.findFirst({
        where: {
          userId: params.userId,
          provider: "YOOKASSA",
          status: { in: ["ACTIVE", "PENDING", "PAST_DUE"] },
        },
        orderBy: [{ isLifetime: "desc" }, { currentPeriodEnd: "desc" }],
        select: {
          id: true,
          status: true,
          isLifetime: true,
          currentPeriodEnd: true,
          yookassaPaymentMethodId: true,
        },
      });
      let subscription =
        existingSubscription ??
        (await tx.appSubscription.create({
          data: {
            userId: params.userId,
            provider: "YOOKASSA",
            status: "PENDING",
            planCode: params.planCode,
            pendingExpiresAt: new Date(params.now.getTime() + YOOKASSA_PENDING_SETUP_TTL_MS),
          },
          select: {
            id: true,
            status: true,
            isLifetime: true,
            currentPeriodEnd: true,
            yookassaPaymentMethodId: true,
          },
        }));

      if (
        subscription.status !== "PENDING" ||
        subscription.yookassaPaymentMethodId ||
        subscription.currentPeriodEnd
      ) {
        subscription = await tx.appSubscription.update({
          where: { id: subscription.id },
          data: {
            status: "PENDING",
            planCode: params.planCode,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            pendingExpiresAt: new Date(params.now.getTime() + YOOKASSA_PENDING_SETUP_TTL_MS),
            cancelAtPeriodEnd: false,
            canceledAt: null,
            yookassaPaymentMethodId: null,
            yookassaPaymentMethodLast4: null,
            yookassaPaymentMethodTitle: null,
            renewalReminderSentForPeriodEnd: null,
          },
          select: {
            id: true,
            status: true,
            isLifetime: true,
            currentPeriodEnd: true,
            yookassaPaymentMethodId: true,
          },
        });
      }

      const periodStart = params.now;
      const periodEnd = new Date(params.now.getTime() + params.intervalDays * 24 * 60 * 60 * 1000);
      const idempotenceKey = `appsub-init:${randomUUID()}`;
      const payment = await tx.appSubscriptionPayment.create({
        data: {
          subscriptionId: subscription.id,
          userId: params.userId,
          provider: "YOOKASSA",
          kind: "INITIAL",
          status: "PENDING",
          planCode: params.planCode,
          amount: amountRub.toNumber(),
          originalAmount: params.originalAmountRub,
          planTitle: params.planTitle,
          currency: params.currency,
          buyerEmail: params.buyerEmail,
          promoCodeId: promo?.id,
          promoCodeSnapshot: promo?.code,
          promoDiscountPercent: promo?.discountPercent,
          periodStart,
          periodEnd,
          idempotenceKey,
          yookassaCheckoutReturnUrl: params.returnUrl,
          attemptCount: 1,
          lastAttemptAt: params.now,
          nextAttemptAt: params.now,
        },
        select: {
          id: true,
          idempotenceKey: true,
          amount: true,
          promoCodeSnapshot: true,
          promoDiscountPercent: true,
        },
      });
      return {
        subscription,
        payment: {
          id: payment.id,
          idempotenceKey: payment.idempotenceKey,
          amountRub: Number(payment.amount),
          currency: params.currency, intervalDays: params.intervalDays, planCode: params.planCode,
          returnUrl: params.returnUrl, attemptCount: 1,
          promoCodeSnapshot: payment.promoCodeSnapshot,
          promoDiscountPercent: payment.promoDiscountPercent,
        },
        reusedConfirmationUrl: null,
      };
    });
  }

  async function startYookassaAppSubscriptionPayment(params: {
    userId: string;
    origin: string;
    shopId: string;
    secretKey: string;
    planCode: AppSubscriptionPlanCode;
    returnPath?: string;
    promoCode?: RequestedAppSubscriptionPromoCode;
    clientContext?: ClientAppContext;
  }): Promise<
    | { success: true; localSubscriptionId: string; confirmationUrl: string }
    | { success: false; error: string; code?: AppSubscriptionCheckoutErrorCode }
  > {
    const settings = await prisma.appSubscriptionSettings.findUnique({
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
    });
    if (params.planCode == null) {
      return { success: false, error: "Выберите тариф подписки" };
    }
    const planCode = normalizeAppSubscriptionPlanCode(params.planCode);
    if (!planCode || !isPublicAppSubscriptionPlanCode(planCode)) {
      return { success: false, error: "Неизвестный тариф подписки", code: "PLAN_NOT_AVAILABLE" };
    }
    const selectedPlan = getAppSubscriptionPlanConfig(settings, planCode);
    if (!selectedPlan.enabled) {
      return { success: false, error: "Тариф подписки недоступен", code: "PLAN_NOT_AVAILABLE" };
    }
    const amountRub = selectedPlan.yookassaPriceRub;
    const intervalDays = selectedPlan.intervalDays;
    const currency = selectedPlan.currency;
    if (!Number.isFinite(amountRub) || amountRub <= 0) {
      return { success: false, error: "Некорректная цена подписки" };
    }
    if (!Number.isFinite(intervalDays) || intervalDays <= 0) {
      return { success: false, error: "Некорректный период подписки" };
    }

    const now = new Date();
    const buyer = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { email: true },
    });
    const buyerEmail = buyer?.email?.trim();
    if (!buyerEmail) {
      return {
        success: false,
        error: "Укажите email в профиле, чтобы получить чек",
        code: "SUBSCRIPTION_EMAIL_REQUIRED",
      };
    }
    const returnPath =
      params.returnPath && (params.returnPath === "/subscription-return.html" || /^\/consultations\/[A-Za-z0-9_-]{1,128}$/.test(params.returnPath))
        ? params.returnPath : "/subscription";
    const returnUrl = `${params.origin.replace(/\/$/, "")}${returnPath}?paid=1`;
    let prepared: PreparedInitialCheckout;
    try {
      prepared = await prepareInitialYookassaCheckout({
        userId: params.userId,
        planCode,
        originalAmountRub: amountRub,
        planTitle: selectedPlan.title,
        currency,
        intervalDays,
        promoCode: params.promoCode,
        clientContext: params.clientContext,
        buyerEmail,
        returnUrl,
        now,
      });
    } catch (error) {
      if (error instanceof AppSubscriptionPromoCodeDomainError) {
        return { success: false, error: error.message, code: error.code };
      }
      throw error;
    }
    const subscription = prepared.subscription;
    if (prepared.reusedConfirmationUrl) {
      return {
        success: true,
        localSubscriptionId: subscription.id,
        confirmationUrl: prepared.reusedConfirmationUrl,
      };
    }
    if (subscription.status !== "PENDING" && subscription.yookassaPaymentMethodId) {
      return { success: false, error: "Способ оплаты уже привязан к подписке" };
    }
    if (!prepared.payment) throw new Error("CHECKOUT_PAYMENT_SNAPSHOT_REQUIRED");
    return startInitialYookassaAppSubscriptionPayment({
      userId: params.userId,
      shopId: params.shopId,
      secretKey: params.secretKey,
      subscriptionId: subscription.id,
      preparedPayment: prepared.payment,
    });
  }

  async function reconcilePendingYookassaAppSubscription(params: {
    userId: string;
    shopId?: string;
    secretKey?: string;
    now?: Date;
  }): Promise<{ activated: true; subscriptionId: string } | { activated: false }> {
    const now = params.now ?? new Date();
    const subscription = await prisma.appSubscription.findFirst({
      where: {
        userId: params.userId,
        provider: "YOOKASSA",
        status: "PENDING",
        yookassaPaymentMethodId: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        userId: true,
        status: true,
        isLifetime: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        pendingExpiresAt: true,
        yookassaPaymentMethodId: true,
      },
    });

    const paymentMethodId = subscription?.yookassaPaymentMethodId;
    if (!subscription || !paymentMethodId) {
      return { activated: false };
    }

    try {
      const providerPaymentMethod = await fetchYookassaPaymentMethodObject({
        paymentMethodId,
        shopId: params.shopId,
        secretKey: params.secretKey,
      });
      const inactiveReason = getYookassaPaymentMethodInactiveReason({
        providerPaymentMethod,
        paymentMethodId,
        subscriptionId: subscription.id,
        userId: subscription.userId,
      });
      if (inactiveReason) {
        if (
          isYookassaPendingSetupExpired({
            pendingExpiresAt: subscription.pendingExpiresAt,
            now,
          })
        ) {
          logger.warn("Expiring pending YooKassa app subscription during user reconciliation", {
            userId: params.userId,
            subscriptionId: subscription.id,
            paymentMethodId,
            reason: inactiveReason,
          });
          await expireYookassaPendingSubscription(subscription.id);
        }
        return { activated: false };
      }
      const activation = await activateYookassaPaymentMethodSubscription({
        subscription,
        paymentMethodId,
        providerPaymentMethod,
        fingerprintSecret: params.secretKey,
      });
      if (!activation.activated) {
        return { activated: false };
      }
      return { activated: true, subscriptionId: subscription.id };
    } catch (error) {
      if (
        error instanceof YookassaHttpError &&
        error.status === 404 &&
        isYookassaPendingSetupExpired({
          pendingExpiresAt: subscription.pendingExpiresAt,
          now,
        })
      ) {
        logger.warn("Expiring pending YooKassa app subscription with missing provider method", {
          userId: params.userId,
          subscriptionId: subscription.id,
          paymentMethodId,
        });
        await expireYookassaPendingSubscription(subscription.id);
        return { activated: false };
      }
      logger.warn("Pending YooKassa app subscription reconciliation failed", {
        userId: params.userId,
        subscriptionId: subscription.id,
        paymentMethodId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { activated: false };
    }
  }

  async function reconcileStaleYookassaPendingAppSubscriptions(params?: {
    now?: Date;
    batchSize?: number;
    shopId?: string;
    secretKey?: string;
  }): Promise<{ checked: number; activated: number; expired: number; deferred: number }> {
    const now = params?.now ?? new Date();
    const batchSize = params?.batchSize ?? 100;
    const rows = await prisma.appSubscription.findMany({
      where: {
        provider: "YOOKASSA",
        status: "PENDING",
        yookassaPaymentMethodId: { not: null },
        pendingExpiresAt: { lte: now },
      },
      orderBy: [{ pendingExpiresAt: "asc" }, { id: "asc" }],
      take: batchSize,
      select: {
        id: true,
        userId: true,
        status: true,
        isLifetime: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        pendingExpiresAt: true,
        yookassaPaymentMethodId: true,
      },
    });

    let activated = 0;
    let expired = 0;
    let deferred = 0;

    for (const row of rows) {
      const paymentMethodId = row.yookassaPaymentMethodId;
      if (!paymentMethodId) {
        deferred += 1;
        continue;
      }

      try {
        const providerPaymentMethod = await fetchYookassaPaymentMethodObject({
          paymentMethodId,
          shopId: params?.shopId,
          secretKey: params?.secretKey,
        });
        const inactiveReason = getYookassaPaymentMethodInactiveReason({
          providerPaymentMethod,
          paymentMethodId,
          subscriptionId: row.id,
          userId: row.userId,
        });

        if (!inactiveReason) {
          const activation = await activateYookassaPaymentMethodSubscription({
            subscription: row,
            paymentMethodId,
            providerPaymentMethod,
            fingerprintSecret: params?.secretKey,
          });
          if (activation.activated) {
            activated += 1;
          } else {
            expired += 1;
          }
          continue;
        }

        logger.warn("Expiring stale pending YooKassa app subscription", {
          userId: row.userId,
          subscriptionId: row.id,
          paymentMethodId,
          reason: inactiveReason,
        });
        await expireYookassaPendingSubscription(row.id);
        expired += 1;
      } catch (error) {
        if (error instanceof YookassaHttpError && error.status === 404) {
          logger.warn(
            "Expiring stale pending YooKassa app subscription with missing provider method",
            {
              userId: row.userId,
              subscriptionId: row.id,
              paymentMethodId,
            },
          );
          await expireYookassaPendingSubscription(row.id);
          expired += 1;
          continue;
        }
        logger.warn("Deferred stale pending YooKassa app subscription reconciliation", {
          userId: row.userId,
          subscriptionId: row.id,
          paymentMethodId,
          error: error instanceof Error ? error.message : String(error),
        });
        deferred += 1;
      }
    }

    return { checked: rows.length, activated, expired, deferred };
  }

  async function cancelYookassaAppSubscription(userId: string) {
    await cancelYookassaAutorenewal(userId);
    return getAppSubscriptionAccess(userId);
  }

  async function verifyAppleAppSubscription(_params: {
    userId: string;
    signedTransactionInfo: string;
  }) {
    const verifierOrErr = getAppleVerifier();
    if (!(verifierOrErr instanceof SignedDataVerifier)) {
      return { success: false as const, code: verifierOrErr.code, error: verifierOrErr.message };
    }

    const payload = await verifierOrErr.verifyAndDecodeTransaction(_params.signedTransactionInfo);
    if (!isAutoRenewableType(payload.type)) {
      return {
        success: false as const,
        code: "APPLE_INVALID_PRODUCT_TYPE",
        error: "Недопустимый тип покупки в App Store",
      };
    }

    const transactionId = payload.transactionId?.trim();
    const originalTransactionId = payload.originalTransactionId?.trim();
    const productId = payload.productId?.trim();
    if (!transactionId || !originalTransactionId || !productId) {
      return {
        success: false as const,
        code: "APPLE_VERIFY_FAILED",
        error: "Некорректный payload Apple",
      };
    }

    const settings = await prisma.appSubscriptionSettings.findUnique({
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
    });
    const applePlan = findAppSubscriptionPlanByAppleProductId(settings, productId);
    const legacyAppleProductId = (settings as { appleProductId?: string | null } | null)
      ?.appleProductId;
    const hasConfiguredAppleProduct = Boolean(
      settings?.weeklyAppleProductId || settings?.monthlyAppleProductId || legacyAppleProductId,
    );
    if (!hasConfiguredAppleProduct) {
      return {
        success: false as const,
        code: "CONFIG_APPLE_IAP",
        error: "Apple product id подписки не задан",
      };
    }
    if (!applePlan) {
      return {
        success: false as const,
        code: "APPLE_PRODUCT_UNKNOWN",
        error: "Продукт подписки не совпадает",
      };
    }

    const user = await prisma.user.findUnique({
      where: { id: _params.userId },
      select: { appleAppAccountToken: true },
    });
    const payloadAppAccountToken =
      typeof (payload as { appAccountToken?: unknown }).appAccountToken === "string"
        ? ((payload as { appAccountToken?: string }).appAccountToken ?? "").trim()
        : "";
    if (!user?.appleAppAccountToken || !payloadAppAccountToken) {
      return {
        success: false as const,
        code: "APPLE_APP_ACCOUNT_TOKEN_REQUIRED",
        error: "Транзакция Apple не привязана к аккаунту",
      };
    }
    if (user.appleAppAccountToken !== payloadAppAccountToken) {
      return {
        success: false as const,
        code: "APPLE_APP_ACCOUNT_TOKEN_MISMATCH",
        error: "Транзакция Apple не принадлежит этому аккаунту",
      };
    }

    const verifiedPeriod = parseAppleTransactionPeriod(payload);
    if (!verifiedPeriod) {
      return {
        success: false as const,
        code: "APPLE_VERIFY_FAILED",
        error: "Некорректный период подписки Apple",
      };
    }
    const { periodStart, periodEnd, isRevoked } = verifiedPeriod;
    const applePriceMilliunits = typeof payload.price === "number" ? Number(payload.price) : null;

    return persistVerifiedApplePurchase({
      userId: _params.userId, originalTransactionId, transactionId, productId,
      planCode: applePlan.code, periodStart, periodEnd, isRevoked,
      priceMilliunits: applePriceMilliunits, currency: payload.currency ?? null,
      storefront: payload.storefront, environment: payload.environment,
      webOrderLineItemId: payload.webOrderLineItemId,
    });
  }

  type AppleLastTransactionLike = {
    status?: number;
    originalTransactionId?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };

  type DecodedAppleTransactionLike = {
    type?: unknown;
    appAccountToken?: string;
    transactionId?: string;
    originalTransactionId?: string;
    productId?: string;
    purchaseDate?: number;
    expiresDate?: number;
    revocationDate?: number;
    price?: number;
    currency?: string;
    storefront?: string;
    environment?: string;
    webOrderLineItemId?: string | number;
  };

  type DecodedAppleRenewalLike = {
    originalTransactionId?: string;
    productId?: string;
    autoRenewStatus?: number;
    expirationIntent?: number;
    isInBillingRetryPeriod?: boolean;
    gracePeriodExpiresDate?: number;
    renewalDate?: number;
    renewalPrice?: number;
    currency?: string;
  };

  async function decodeAppleLastTransaction(params: {
    verifier: SignedDataVerifier;
    item: AppleLastTransactionLike;
  }): Promise<{
    transaction: DecodedAppleTransactionLike;
    renewal: DecodedAppleRenewalLike | null;
  }> {
    if (!params.item.signedTransactionInfo) {
      throw new Error("Apple status item has no signedTransactionInfo");
    }

    const transaction = await params.verifier.verifyAndDecodeTransaction(
      params.item.signedTransactionInfo,
    );
    const renewal = params.item.signedRenewalInfo
      ? await params.verifier.verifyAndDecodeRenewalInfo(params.item.signedRenewalInfo)
      : null;

    return {
      transaction: transaction as DecodedAppleTransactionLike,
      renewal: renewal as DecodedAppleRenewalLike | null,
    };
  }

  async function syncAppleAppSubscriptionFromServer(params: {
    originalTransactionId: string;
    subscriptionId?: string;
    userId?: string;
    now?: Date;
  }) {
    const originalTransactionId = params.originalTransactionId.trim();
    if (!originalTransactionId) {
      return {
        success: false as const,
        code: "APPLE_SYNC_INPUT_REQUIRED",
        error: "Требуется originalTransactionId",
      };
    }

    const client = getAppleServerApiClient();
    if (!(client instanceof AppStoreServerAPIClient)) {
      return { success: false as const, code: client.code, error: client.message };
    }

    const verifierOrErr = getAppleVerifier();
    if (!(verifierOrErr instanceof SignedDataVerifier)) {
      return { success: false as const, code: verifierOrErr.code, error: verifierOrErr.message };
    }

    const candidates = await prisma.appSubscription.findMany({
      where: { provider: "APPLE", appleOriginalTransactionId: originalTransactionId },
      select: {
        id: true,
        userId: true,
        appleProductId: true,
        planCode: true,
        user: { select: { appleAppAccountToken: true } },
      },
    });
    if (!candidates.some(candidate =>
      (!params.subscriptionId || candidate.id === params.subscriptionId) &&
      (!params.userId || candidate.userId === params.userId))) {
      return {
        success: false as const,
        code: "APPLE_RESTORE_NOT_FOUND",
        error: "Подписка не найдена",
      };
    }

    const response = await client.getAllSubscriptionStatuses(originalTransactionId);
    const lastTransactions = (response.data ?? []).flatMap(
      (group) => group.lastTransactions ?? [],
    ) as AppleLastTransactionLike[];
    const exactItem = lastTransactions.find((item) => item.originalTransactionId === originalTransactionId);
    if (!exactItem) {
      // An empty/mismatched provider response is not verified revocation.
      // Keep the current persisted period and retry reconciliation instead.
      return {
        success: false as const,
        code: "APPLE_VERIFY_FAILED",
        error: "Apple не вернул состояние этой подписки",
      };
    }

    const { transaction, renewal } = await decodeAppleLastTransaction({
      verifier: verifierOrErr,
      item: exactItem,
    });
    const txOriginalTransactionId = transaction.originalTransactionId?.trim();
    if (txOriginalTransactionId !== originalTransactionId) {
      return {
        success: false as const,
        code: "APPLE_TRANSACTION_CONFLICT",
        error: "Ответ Apple относится к другой подписке",
      };
    }
    if (!isAutoRenewableType(transaction.type)) {
      return {
        success: false as const,
        code: "APPLE_INVALID_PRODUCT_TYPE",
        error: "Недопустимый тип покупки в App Store",
      };
    }

    const transactionId = transaction.transactionId?.trim();
    if (!transactionId) {
      return {
        success: false as const,
        code: "APPLE_VERIFY_FAILED",
        error: "Некорректный payload Apple",
      };
    }
    const receipt = await prisma.appSubscriptionPayment.findUnique({
      where: { appleTransactionId: transactionId },
      select: { userId: true, subscriptionId: true, appleOriginalTransactionId: true },
    });
    const subscription = selectAppleSyncOwner({
      candidates, originalTransactionId, receipt,
      appAccountToken: transaction.appAccountToken,
      requestedUserId: params.userId,
      requestedSubscriptionId: params.subscriptionId,
    });
    if (!subscription) {
      return {
        success: false as const,
        code: "APPLE_TRANSACTION_CONFLICT",
        error: "Транзакция Apple не принадлежит этой подписке",
      };
    }
    const productId =
      transaction.productId?.trim() ?? renewal?.productId?.trim() ?? subscription.appleProductId;
    if (!productId) {
      return { success: false as const, code: "APPLE_VERIFY_FAILED", error: "Некорректный payload Apple" };
    }

    const verifiedPeriod = parseAppleTransactionPeriod(transaction);
    if (!verifiedPeriod) return {
      success: false as const, code: "APPLE_VERIFY_FAILED",
      error: "Некорректный период подписки Apple",
    };
    const { periodStart, periodEnd } = verifiedPeriod;
    const status = mapAppleServerStatus({
      appleStatus: exactItem.status,
      transaction,
      now: params.now ?? new Date(),
    });
    const paymentStatus = applePaymentStatus(status);
    const priceMilliunits =
      typeof transaction.price === "number"
        ? transaction.price
        : typeof renewal?.renewalPrice === "number"
          ? renewal.renewalPrice
          : null;
    const currency = transaction.currency ?? renewal?.currency ?? null;
    const planCode = normalizeAppSubscriptionPlanCode(subscription.planCode) ?? "MONTHLY";

    try {
      const persistedStatus = await persistVerifiedAppleServerState({
        subscription,
        originalTransactionId,
        transactionId,
        productId,
        status,
        planCode,
        paymentStatus,
        periodStart,
        periodEnd,
        priceMilliunits,
        currency,
        transaction,
        renewal,
        appleStatus: exactItem.status ?? null,
      });

      return { success: true as const, status: persistedStatus, userId: subscription.userId };
    } catch (error) {
      if (error instanceof Error && error.message === "APPLE_TRANSACTION_CONFLICT") {
        return { success: false as const, code: "APPLE_TRANSACTION_CONFLICT", error: "Транзакция Apple не принадлежит этой подписке" };
      }
      if (error instanceof Error && error.message === "APPLE_TRANSACTION_REVOKED") {
        return { success: false as const, code: "APPLE_SUBSCRIPTION_INACTIVE", error: "Подписка Apple не активна" };
      }
      throw error;
    }
  }

  async function reconcileAppleAppSubscriptionsFromServer(params?: { batchSize?: number }) {
    const batchSize = Math.max(1, Math.min(params?.batchSize ?? 100, 500));
    const rows = await prisma.appSubscription.findMany({
      where: {
        provider: "APPLE",
        appleOriginalTransactionId: { not: null },
        status: { in: ["ACTIVE", "PAST_DUE", "PENDING"] },
      },
      orderBy: [{ updatedAt: "asc" }],
      take: batchSize,
      select: {
        id: true,
        userId: true,
        appleOriginalTransactionId: true,
      },
    });

    let synced = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of rows) {
      if (!row.appleOriginalTransactionId) {
        skipped += 1;
        continue;
      }

      try {
        const result = await syncAppleAppSubscriptionFromServer({
          originalTransactionId: row.appleOriginalTransactionId,
          subscriptionId: row.id,
        });
        if (result.success) {
          synced += 1;
        } else if (result.code === "CONFIG_APPLE_SERVER_API") {
          skipped += 1;
        } else {
          failed += 1;
        }
      } catch (error) {
        failed += 1;
        logger.error("Apple app subscription reconciliation failed", error as Error, {
          subscriptionId: row.id,
          userId: row.userId,
        });
      }
    }

    return { processed: rows.length, synced, failed, skipped };
  }

  async function restoreAppleAppSubscription(_params: {
    userId: string;
    originalTransactionId?: string;
    signedTransactionInfo?: string;
  }) {
    if (_params.signedTransactionInfo) {
      return verifyAppleAppSubscription({
        userId: _params.userId,
        signedTransactionInfo: _params.signedTransactionInfo,
      });
    }

    if (!_params.originalTransactionId) {
      return {
        success: false as const,
        code: "APPLE_RESTORE_INPUT_REQUIRED",
        error: "Требуется originalTransactionId или signedTransactionInfo",
      };
    }

    // Restore is not a local state transition. A future expiry may belong
    // to a revoked receipt; only a verified provider response can restore access.
    const result = await syncAppleAppSubscriptionFromServer({
      originalTransactionId: _params.originalTransactionId,
      userId: _params.userId,
    });
    if (!result.success) return result;
    if (result.status !== "ACTIVE") {
      return {
        success: false as const,
        code: "APPLE_SUBSCRIPTION_INACTIVE",
        error: "Подписка Apple не активна",
      };
    }
    return { success: true as const };
  }

  async function handleYookassaAppSubscriptionWebhook(params: {
    event: string;
    yookassaPaymentId: string;
    yookassaRefundId?: string;
    amount?: string;
    paymentMethodId?: string | null;
    paymentMethodLast4?: string | null;
    paymentMethodTitle?: string | null;
    providerEventKey?: string;
    metadata?: Record<string, string | undefined>;
    payloadHash?: string;
    shopId?: string;
    secretKey?: string;
  }): Promise<{ userId: string | null }> {
    const providerEventKey =
      params.providerEventKey ??
      `${params.event}:${params.event === "refund.succeeded" ? (params.yookassaRefundId ?? params.yookassaPaymentId) : params.yookassaPaymentId}`;
    let eventId: string | null = null;
    let metadata = params.metadata;

    try {
      const event = await prisma.appSubscriptionEvent.create({
        data: {
          source: "YOOKASSA",
          eventType: params.event,
          providerEventKey,
          payloadHash: params.payloadHash ?? null,
          metadata: {
            yookassaPaymentId: params.yookassaPaymentId,
            paymentMethodId: params.paymentMethodId ?? null,
            paymentMethodLast4: params.paymentMethodLast4 ?? null,
            paymentMethodTitle: params.paymentMethodTitle ?? null,
            amount: params.amount ?? null,
            ...params.metadata,
          },
          processingStatus: "RECEIVED",
        },
        select: { id: true },
      });
      eventId = event.id;
    } catch (error) {
      if (!isPrismaUniqueViolation(error)) {
        throw error;
      }

      const existingEvent = await prisma.appSubscriptionEvent.findFirst({
        where: { providerEventKey },
        select: { id: true, metadata: true, processingStatus: true },
      });
      eventId = existingEvent?.id ?? null;
      if (existingEvent?.metadata && typeof existingEvent.metadata === "object") {
        metadata = existingEvent.metadata as Record<string, string | undefined>;
      }
      logger.warn("Duplicate app-subscription webhook event", {
        metric: "webhook_duplicate_total",
        source: "YOOKASSA",
        providerEventKey,
        yookassaPaymentId: params.yookassaPaymentId,
        processingStatus: existingEvent?.processingStatus,
      });
    }

    if (params.event === "payment_method.active") {
      const subscriptionId = metadata?.subscriptionId;
      const paymentMethodId = params.paymentMethodId ?? params.yookassaPaymentId;
      if (!paymentMethodId) {
        logger.warn("App subscription payment method webhook without paymentMethodId", {
          paymentMethodId,
          event: params.event,
        });
        return { userId: null };
      }

      const subscription = await prisma.appSubscription.findFirst({
        where: subscriptionId
          ? { id: subscriptionId }
          : { yookassaPaymentMethodId: paymentMethodId },
        select: {
          id: true,
          userId: true,
          status: true,
          isLifetime: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          yookassaPaymentMethodId: true,
        },
      });
      if (!subscription) {
        logger.warn("App subscription payment method webhook with unknown subscription", {
          subscriptionId,
          paymentMethodId,
        });
        return { userId: null };
      }

      try {
        const providerPaymentMethod = await fetchYookassaPaymentMethodObject({
          paymentMethodId,
          shopId: params.shopId,
          secretKey: params.secretKey,
        });
        assertYookassaPaymentMethodActive({
          providerPaymentMethod,
          paymentMethodId,
          subscriptionId: subscription.id,
          userId: subscription.userId,
        });

        await activateYookassaPaymentMethodSubscription({
          subscription,
          paymentMethodId,
          providerPaymentMethod,
          fingerprintSecret: params.secretKey,
        });

        if (eventId) {
          await prisma.appSubscriptionEvent
            .update({
              where: { id: eventId },
              data: {
                processingStatus: "PROCESSED",
                processedAt: new Date(),
                userId: subscription.userId,
                subscriptionId: subscription.id,
              },
            })
            .catch(() => undefined);
        }
      } catch (error) {
        if (eventId) {
          await prisma.appSubscriptionEvent
            .update({
              where: { id: eventId },
              data: {
                processingStatus: "FAILED",
                lastProcessingError: error instanceof Error ? error.message : String(error),
                processingAttempts: { increment: 1 },
              },
            })
            .catch(() => undefined);
        }
        throw error;
      }

      return { userId: subscription.userId };
    }

    if (params.event === "refund.succeeded") {
      const refundId = params.yookassaRefundId;
      if (!refundId) throw new Error("YooKassa refund webhook without refund id");
      const refund = await fetchYookassaRefundObject({
        yookassaRefundId: refundId,
        shopId: params.shopId,
        secretKey: params.secretKey,
      });
      if (refund.id !== refundId || refund.status !== "succeeded" || !refund.payment_id) {
        throw new Error("YooKassa refund is not confirmed");
      }
      if (params.yookassaPaymentId && refund.payment_id !== params.yookassaPaymentId) {
        throw new Error("YooKassa refund payment id mismatch");
      }
      const providerPayment = await fetchYookassaPaymentObject({
        yookassaPaymentId: refund.payment_id,
        shopId: params.shopId,
        secretKey: params.secretKey,
      });
      const payment = await prisma.appSubscriptionPayment.findUnique({
        where: { yookassaPaymentId: refund.payment_id },
        select: {
          id: true,
          userId: true,
          subscriptionId: true,
          status: true,
          amount: true,
          currency: true,
          periodEnd: true,
          yookassaPaymentId: true,
        },
      });
      // A verified non-Premium payment is deliberately left to the legacy
      // webhook branch. This is not a decision based on the incoming payload.
      if (!payment) return { userId: null };
      assertYookassaPaymentConfirmed({
        providerPayment,
        localPayment: payment,
        yookassaPaymentId: refund.payment_id,
      });
      await enrichPaymentFinance(payment.id, providerPayment, {
        ...payment,
        yookassaPaymentId: providerPayment.id!,
      });
      // Persist the verified refund, the local entitlement change, commission
      // reversal and fiscalization intent in the same database transaction.
      const { fullRefund, financeIncomplete } = await applyVerifiedYookassaRefund(payment.id, refund);
      if (financeIncomplete) {
        logger.warn("Refund finance requires reconciliation", { paymentId: payment.id });
      }
      if (!fullRefund) {
        logger.warn("Partial app-subscription refund requires NPD reconciliation", {
          refundId, paymentId: payment.id, amount: refund.amount?.value,
        });
        if (eventId) {
          await prisma.appSubscriptionEvent
            .update({
              where: { id: eventId },
              data: {
                processingStatus: "PROCESSED",
                processedAt: new Date(),
                userId: payment.userId,
                lastProcessingError: "PARTIAL_REFUND_NOT_FISCALIZED",
              },
            })
            .catch(() => undefined);
        }
        return { userId: payment.userId };
      }
      if (eventId) {
        await prisma.appSubscriptionEvent
          .update({
            where: { id: eventId },
            data: {
              processingStatus: "PROCESSED",
              processedAt: new Date(),
              userId: payment.userId,
            },
          })
          .catch(() => undefined);
      }
      return { userId: payment.userId };
    }

    const localPaymentId = metadata?.localPaymentId;
    if (!localPaymentId) {
      logger.warn("App subscription webhook without localPaymentId", {
        yookassaPaymentId: params.yookassaPaymentId,
        event: params.event,
      });
      return { userId: null };
    }

    const payment = await prisma.appSubscriptionPayment.findUnique({
      where: { id: localPaymentId },
      select: {
        id: true,
        userId: true,
        subscriptionId: true,
        status: true,
        kind: true,
        planCode: true,
        promoCodeId: true,
        planTitle: true,
        originalAmount: true,
        amount: true,
        currency: true,
        periodStart: true,
        periodEnd: true,
        subscription: { select: { currentPeriodEnd: true, renewalIntervalDays: true } },
      },
    });
    if (!payment) {
      logger.warn("App subscription webhook with unknown localPaymentId", {
        localPaymentId,
        yookassaPaymentId: params.yookassaPaymentId,
        event: params.event,
      });
      return { userId: null };
    }
    if (payment.status === "SUCCEEDED" || payment.status === "REFUNDED") {
      if (params.event === "payment.succeeded") {
        const confirmed = await fetchYookassaPaymentObject({
          yookassaPaymentId: params.yookassaPaymentId,
          shopId: params.shopId,
          secretKey: params.secretKey,
        });
        assertYookassaPaymentConfirmed({
          providerPayment: confirmed,
          localPayment: payment,
          yookassaPaymentId: params.yookassaPaymentId,
        });
        await enrichPaymentFinance(payment.id, confirmed, {
          ...payment,
          yookassaPaymentId: params.yookassaPaymentId,
        });
      }
      if (eventId) {
        await prisma.appSubscriptionEvent
          .update({
            where: { id: eventId },
            data: {
              processingStatus: "PROCESSED",
              processedAt: new Date(),
              userId: payment.userId,
            },
          })
          .catch(() => undefined);
      }
      return { userId: payment.userId };
    }

    try {
      if (params.event === "payment.succeeded") {
        const providerPayment = await fetchYookassaPaymentObject({
          yookassaPaymentId: params.yookassaPaymentId,
          shopId: params.shopId,
          secretKey: params.secretKey,
        });
        assertYookassaPaymentConfirmed({
          providerPayment,
          localPayment: payment,
          yookassaPaymentId: params.yookassaPaymentId,
        });
        await enrichPaymentFinance(payment.id, providerPayment, {
          ...payment,
          yookassaPaymentId: providerPayment.id!,
        });
        const providerPaymentMethodId =
          providerPayment.payment_method?.id ?? params.paymentMethodId;
        const providerPaymentMethodLast4 =
          providerPayment.payment_method?.card?.last4 ?? params.paymentMethodLast4;
        const providerPaymentMethodTitle = getYookassaPaymentMethodDisplayTitle({
          type: providerPayment.payment_method?.type,
          title: providerPayment.payment_method?.title ?? params.paymentMethodTitle,
          last4: providerPaymentMethodLast4,
        });
        const now = new Date();
        let periodStart = payment.periodStart;
        let periodEnd = payment.periodEnd;
        if (!periodStart || !periodEnd) {
          const settings = await prisma.appSubscriptionSettings.findUnique({
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
          });
          const fallbackPlan =
            findAppSubscriptionPlanConfig(settings, payment.planCode) ??
            getAppSubscriptionPlanConfig(settings, "MONTHLY");
          const currentPeriodEnd = payment.subscription?.currentPeriodEnd;
          periodStart = currentPeriodEnd && currentPeriodEnd > now ? currentPeriodEnd : now;
          periodEnd = new Date(
            periodStart.getTime() +
              (payment.subscription?.renewalIntervalDays ?? fallbackPlan.intervalDays) *
                24 *
                60 *
                60 *
                1000,
          );
        }

        await applyVerifiedYookassaPayment({
          payment,
          yookassaPaymentId: params.yookassaPaymentId,
          providerCurrency: providerPayment.amount?.currency,
          providerPaymentMethodId,
          providerPaymentMethodLast4,
          providerPaymentMethodTitle,
          periodStart,
          periodEnd,
          now,
        });
      } else if (params.event === "payment.canceled") {
        const providerPayment = await fetchYookassaPaymentObject({
          yookassaPaymentId: params.yookassaPaymentId,
          shopId: params.shopId,
          secretKey: params.secretKey,
        });
        assertYookassaPaymentCanceled({
          providerPayment,
          localPayment: payment,
          yookassaPaymentId: params.yookassaPaymentId,
        });
        await applyVerifiedYookassaCancellation(payment.id, params.yookassaPaymentId);
      }

      if (eventId) {
        await prisma.appSubscriptionEvent
          .update({
            where: { id: eventId },
            data: {
              processingStatus: "PROCESSED",
              processedAt: new Date(),
              userId: payment.userId,
            },
          })
          .catch(() => undefined);
      }
    } catch (error) {
      if (eventId) {
        await prisma.appSubscriptionEvent
          .update({
            where: { id: eventId },
            data: {
              processingStatus: "FAILED",
              lastProcessingError: error instanceof Error ? error.message : String(error),
              processingAttempts: { increment: 1 },
            },
          })
          .catch(() => undefined);
      }
      throw error;
    }

    return { userId: payment.userId };
  }

  async function handleAppleAppSubscriptionNotification(params: { signedPayload: string }) {
    const verifierOrErr = getAppleVerifier();
    if (!(verifierOrErr instanceof SignedDataVerifier)) {
      return { success: false as const, error: verifierOrErr.message, code: verifierOrErr.code };
    }

    const decoded = await verifierOrErr.verifyAndDecodeNotification(params.signedPayload);
    const eventType = decoded.notificationType ?? "UNKNOWN";
    const subtype = decoded.subtype ?? null;
    const notificationUUID = decoded.notificationUUID ?? null;
    const signedTransactionInfo = decoded.data?.signedTransactionInfo ?? null;
    const signedRenewalInfo = decoded.data?.signedRenewalInfo ?? null;

    if (notificationUUID) {
      try {
        await prisma.appSubscriptionEvent.create({
          data: {
            source: "APPLE",
            eventType: subtype ? `${eventType}:${subtype}` : eventType,
            providerEventKey: notificationUUID,
            processingStatus: "RECEIVED",
            metadata: {
              notificationType: eventType,
              subtype,
            },
          },
        });
      } catch (error) {
        if (!isPrismaUniqueViolation(error)) throw error;
        const previous = await prisma.appSubscriptionEvent.findUnique({
          where: { providerEventKey: notificationUUID },
          select: { processingStatus: true },
        });
        if (
          previous?.processingStatus === "PROCESSED" ||
          previous?.processingStatus === "PROCESSING"
        ) {
          return { success: true as const, duplicate: true };
        }
      }
      const claimed = await prisma.appSubscriptionEvent.updateMany({
        where: {
          providerEventKey: notificationUUID,
          processingStatus: { in: ["RECEIVED", "FAILED"] },
        },
        data: {
          processingStatus: "PROCESSING",
          processingAttempts: { increment: 1 },
          lastProcessingError: null,
        },
      });
      if (claimed.count !== 1) return { success: true as const, duplicate: true };
    }

    const markProcessed = async () => {
      if (notificationUUID)
        await prisma.appSubscriptionEvent.update({
          where: { providerEventKey: notificationUUID },
          data: {
            processingStatus: "PROCESSED",
            processedAt: new Date(),
            lastProcessingError: null,
          },
        });
    };

    try {
      let originalTransactionId: string | null = null;
      let signedTransactionAppAccountToken: string | null = null;
      let signedTransactionWasRevoked = false;
      if (signedTransactionInfo) {
        const tx = await verifierOrErr.verifyAndDecodeTransaction(signedTransactionInfo);
        originalTransactionId = tx.originalTransactionId?.trim() || null;
        signedTransactionAppAccountToken =
          typeof (tx as { appAccountToken?: unknown }).appAccountToken === "string"
            ? ((tx as { appAccountToken?: string }).appAccountToken ?? "").trim() || null
            : null;
        signedTransactionWasRevoked =
          Number((tx as { revocationDate?: unknown }).revocationDate ?? 0) > 0;
      }
      if (!originalTransactionId && signedRenewalInfo) {
        const renewal = await verifierOrErr.verifyAndDecodeRenewalInfo(signedRenewalInfo);
        originalTransactionId = renewal.originalTransactionId?.trim() || null;
      }

      if (signedTransactionInfo && signedTransactionAppAccountToken) {
        const user = await prisma.user.findUnique({
          where: { appleAppAccountToken: signedTransactionAppAccountToken },
          select: { id: true },
        });
        if (user?.id) {
          const verified = await verifyAppleAppSubscription({
            userId: user.id,
            signedTransactionInfo,
          });
          if (!verified.success && verified.code !== "APPLE_SUBSCRIPTION_INACTIVE") {
            throw new Error(`Apple notification verification failed: ${verified.code}`);
          }
          // A normal signed transaction is fully verified above. For a revocation,
          // fetch the authoritative subscription status before acknowledging it.
          if (originalTransactionId && signedTransactionWasRevoked) {
            const synced = await syncAppleAppSubscriptionFromServer({ originalTransactionId, userId: user.id });
            if (!synced.success) throw new Error("Apple notification synchronization failed");
          }
          await markProcessed();
          return { success: true as const };
        }
      }

      if (originalTransactionId) {
        const syncResult = await syncAppleAppSubscriptionFromServer({ originalTransactionId });
        if (!syncResult.success) {
          throw new Error("Apple notification synchronization failed");
        }
      }

      await markProcessed();
      return { success: true as const };
    } catch (error) {
      if (notificationUUID)
        await prisma.appSubscriptionEvent
          .update({
            where: { providerEventKey: notificationUUID },
            data: {
              processingStatus: "FAILED",
              lastProcessingError:
                error instanceof Error ? error.message.slice(0, 512) : "Apple notification failed",
            },
          })
          .catch(() => undefined);
      throw error;
    }
  }

  return {
    startYookassaAppSubscriptionPayment,
    reconcilePendingYookassaAppSubscription,
    reconcileStaleYookassaPendingAppSubscriptions,
    cancelYookassaAppSubscription,
    verifyAppleAppSubscription,
    syncAppleAppSubscriptionFromServer,
    reconcileAppleAppSubscriptionsFromServer,
    restoreAppleAppSubscription,
    handleYookassaAppSubscriptionWebhook,
    handleAppleAppSubscriptionNotification,
  };
}
