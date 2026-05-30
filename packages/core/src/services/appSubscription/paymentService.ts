import { createHash } from "node:crypto";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { Environment, SignedDataVerifier, Type } from "@apple/app-store-server-library";

import { getAppSubscriptionAccess } from "./accessService";
import {
  getYookassaTrialAvailability,
  recordYookassaTrialStarted,
  YOOKASSA_TRIAL_DAYS,
} from "./trialService";

const logger = createWebLogger("app-subscription-payment-service");
const YOOKASSA_API = "https://api.yookassa.ru/v3/payments";
const YOOKASSA_PAYMENT_METHODS_API = "https://api.yookassa.ru/v3/payment_methods";
const YOOKASSA_PENDING_SETUP_TTL_MS = 60 * 60 * 1000;
const YOOKASSA_START_LOCK_NAMESPACE = 90210018;
const APPLE_ROOT_CA_G3_DER_BASE64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";

let appleVerifierSingleton: SignedDataVerifier | null = null;
let appleVerifierConfigKey: string | null = null;

class YookassaHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "YookassaHttpError";
  }
}

function parseEnvBoolean(raw: string | undefined): boolean {
  return raw === "1" || raw?.toLowerCase() === "true";
}

function getAppleVerifier():
  | SignedDataVerifier
  | { ok: false; code: string; message: string } {
  const bundleId = process.env.APPLE_BUNDLE_ID?.trim();
  if (!bundleId) {
    return { ok: false, code: "CONFIG_APPLE_IAP", message: "APPLE_BUNDLE_ID не задан" };
  }
  const useSandbox = parseEnvBoolean(process.env.APPLE_USE_SANDBOX);
  const environment = useSandbox ? Environment.SANDBOX : Environment.PRODUCTION;

  let appAppleId: number | undefined;
  const appIdRaw = process.env.APPLE_APP_ID?.trim();
  if (appIdRaw) {
    const n = Number.parseInt(appIdRaw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, code: "CONFIG_APPLE_IAP", message: "Некорректный APPLE_APP_ID" };
    }
    appAppleId = n;
  } else if (environment === Environment.PRODUCTION) {
    return { ok: false, code: "CONFIG_APPLE_IAP", message: "Для production требуется APPLE_APP_ID" };
  }

  const configKey = `${bundleId}|${environment}|${appAppleId ?? ""}`;
  if (appleVerifierSingleton && appleVerifierConfigKey === configKey) {
    return appleVerifierSingleton;
  }

  const appleRootCAs = [Buffer.from(APPLE_ROOT_CA_G3_DER_BASE64, "base64")];
  appleVerifierSingleton = new SignedDataVerifier(
    appleRootCAs,
    true,
    environment,
    bundleId,
    appAppleId,
  );
  appleVerifierConfigKey = configKey;
  return appleVerifierSingleton;
}

function isAutoRenewableType(type: unknown): boolean {
  return (
    type === Type.AUTO_RENEWABLE_SUBSCRIPTION ||
    type === "Auto-Renewable Subscription"
  );
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function hashAdvisoryLockKey(value: string): number {
  return createHash("sha256").update(value).digest().readInt32BE(0);
}

type YooKassaPaymentObject = {
  id?: string;
  status?: string;
  paid?: boolean;
  amount?: { value?: string; currency?: string };
  metadata?: Record<string, string | undefined>;
  payment_method?: {
    id?: string;
    title?: string;
    card?: { last4?: string };
  };
};

type YooKassaPaymentMethodObject = {
  id?: string;
  status?: string;
  saved?: boolean;
  type?: string;
  title?: string;
  card?: { last4?: string };
  metadata?: Record<string, string | undefined>;
  confirmation?: { confirmation_url?: string };
};

function getYookassaCredentials(params?: { shopId?: string; secretKey?: string }) {
  const shopId = params?.shopId ?? process.env.YOOKASSA_SHOP_ID;
  const secretKey = params?.secretKey ?? process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    throw new Error("YooKassa credentials are missing");
  }
  return { shopId, secretKey };
}

function amountsEqual(a: unknown, b: unknown): boolean {
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 0.001;
}

async function fetchYookassaPaymentObject(params: {
  yookassaPaymentId: string;
  shopId?: string;
  secretKey?: string;
}): Promise<YooKassaPaymentObject> {
  const { shopId, secretKey } = getYookassaCredentials(params);
  const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  const response = await fetch(`${YOOKASSA_API}/${encodeURIComponent(params.yookassaPaymentId)}`, {
    method: "GET",
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new YookassaHttpError(
      `YooKassa payment verification failed: ${response.status} ${text}`.slice(0, 512),
      response.status,
    );
  }
  return (await response.json()) as YooKassaPaymentObject;
}

async function fetchYookassaPaymentMethodObject(params: {
  paymentMethodId: string;
  shopId?: string;
  secretKey?: string;
}): Promise<YooKassaPaymentMethodObject> {
  const { shopId, secretKey } = getYookassaCredentials(params);
  const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  const response = await fetch(`${YOOKASSA_PAYMENT_METHODS_API}/${encodeURIComponent(params.paymentMethodId)}`, {
    method: "GET",
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new YookassaHttpError(
      `YooKassa payment method verification failed: ${response.status} ${text}`.slice(0, 512),
      response.status,
    );
  }
  return (await response.json()) as YooKassaPaymentMethodObject;
}

function assertYookassaPaymentBelongsToLocalPayment(params: {
  providerPayment: YooKassaPaymentObject;
  localPayment: {
    id: string;
    userId: string;
    amount?: unknown;
    currency?: string | null;
  };
  yookassaPaymentId: string;
}) {
  const providerPayment = params.providerPayment;
  if (providerPayment.id !== params.yookassaPaymentId) {
    throw new Error("YooKassa payment id mismatch");
  }
  if (providerPayment.metadata?.kind !== "app_subscription") {
    throw new Error("YooKassa payment metadata kind mismatch");
  }
  if (providerPayment.metadata?.localPaymentId !== params.localPayment.id) {
    throw new Error("YooKassa payment metadata localPaymentId mismatch");
  }
  if (providerPayment.metadata?.userId !== params.localPayment.userId) {
    throw new Error("YooKassa payment metadata userId mismatch");
  }

  if (!amountsEqual(providerPayment.amount?.value, params.localPayment.amount)) {
    throw new Error("YooKassa payment amount mismatch");
  }
  if ((providerPayment.amount?.currency ?? null) !== (params.localPayment.currency ?? null)) {
    throw new Error("YooKassa payment currency mismatch");
  }
}

type YookassaPaymentAssertionParams = Parameters<
  typeof assertYookassaPaymentBelongsToLocalPayment
>[0];

function assertYookassaPaymentConfirmed(params: YookassaPaymentAssertionParams) {
  assertYookassaPaymentBelongsToLocalPayment(params);
  if (params.providerPayment.status !== "succeeded" || params.providerPayment.paid !== true) {
    throw new Error("YooKassa payment is not confirmed");
  }
}

function assertYookassaPaymentCanceled(params: YookassaPaymentAssertionParams) {
  assertYookassaPaymentBelongsToLocalPayment(params);
  if (params.providerPayment.status !== "canceled") {
    throw new Error("YooKassa payment is not canceled");
  }
}

function assertYookassaPaymentMethodActive(params: {
  providerPaymentMethod: YooKassaPaymentMethodObject;
  paymentMethodId: string;
  subscriptionId: string;
  userId: string;
}) {
  const method = params.providerPaymentMethod;
  if (method.id !== params.paymentMethodId) {
    throw new Error("YooKassa payment method id mismatch");
  }
  if (!method.metadata) {
    throw new Error("YooKassa payment method metadata is missing");
  }
  if (method.metadata.kind !== "app_subscription_payment_method") {
    throw new Error("YooKassa payment method metadata kind mismatch");
  }
  if (method.metadata.subscriptionId !== params.subscriptionId) {
    throw new Error("YooKassa payment method metadata subscriptionId mismatch");
  }
  if (method.metadata.userId !== params.userId) {
    throw new Error("YooKassa payment method metadata userId mismatch");
  }
  if (method.status !== "active" || method.saved !== true) {
    throw new Error("YooKassa payment method is not active and saved");
  }
}

function getYookassaPaymentMethodInactiveReason(params: {
  providerPaymentMethod: YooKassaPaymentMethodObject;
  paymentMethodId: string;
  subscriptionId: string;
  userId: string;
}): string | null {
  const method = params.providerPaymentMethod;
  if (method.id !== params.paymentMethodId) {
    return "YooKassa payment method id mismatch";
  }
  if (!method.metadata) {
    return "YooKassa payment method metadata is missing";
  }
  if (method.metadata.kind !== "app_subscription_payment_method") {
    return "YooKassa payment method metadata kind mismatch";
  }
  if (method.metadata.subscriptionId !== params.subscriptionId) {
    return "YooKassa payment method metadata subscriptionId mismatch";
  }
  if (method.metadata.userId !== params.userId) {
    return "YooKassa payment method metadata userId mismatch";
  }
  if (method.status !== "active" || method.saved !== true) {
    return "YooKassa payment method is not active and saved";
  }
  return null;
}

async function expireYookassaPendingSubscription(subscriptionId: string) {
  await prisma.appSubscription.update({
    where: { id: subscriptionId },
    data: {
      status: "EXPIRED",
      pendingExpiresAt: null,
      yookassaPaymentMethodId: null,
      yookassaPaymentMethodLast4: null,
      yookassaPaymentMethodTitle: null,
    },
  });
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
}) {
  const now = new Date();
  const hasCurrentAccess =
    params.subscription.status === "ACTIVE" && (
      params.subscription.isLifetime === true ||
      (
        params.subscription.currentPeriodEnd instanceof Date &&
        params.subscription.currentPeriodEnd > now
      )
    );
  const periodStart = hasCurrentAccess
    ? params.subscription.currentPeriodStart
    : now;
  const periodEnd = hasCurrentAccess
    ? params.subscription.currentPeriodEnd
    : new Date(now.getTime() + YOOKASSA_TRIAL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.appSubscription.update({
      where: { id: params.subscription.id },
      data: {
        status: "ACTIVE",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        pendingExpiresAt: null,
        cancelAtPeriodEnd: false,
        yookassaPaymentMethodId: params.paymentMethodId,
        ...(params.providerPaymentMethod.card?.last4
          ? { yookassaPaymentMethodLast4: params.providerPaymentMethod.card.last4 }
          : {}),
        ...(params.providerPaymentMethod.title
          ? { yookassaPaymentMethodTitle: params.providerPaymentMethod.title }
          : {}),
        renewalReminderSentForPeriodEnd: null,
      },
    });

    if (!hasCurrentAccess && periodStart && periodEnd) {
      await recordYookassaTrialStarted({
        userId: params.subscription.userId,
        subscriptionId: params.subscription.id,
        startedAt: periodStart,
        endedAt: periodEnd,
        tx,
      });
    }
  });
}

async function startInitialYookassaAppSubscriptionPayment(params: {
  userId: string;
  origin: string;
  shopId: string;
  secretKey: string;
  subscriptionId: string;
  amountRub: number;
  currency: string;
  intervalDays: number;
  now: Date;
}): Promise<
  | { success: true; localSubscriptionId: string; confirmationUrl: string }
  | { success: false; error: string }
> {
  const periodStart = params.now;
  const periodEnd = new Date(
    params.now.getTime() + params.intervalDays * 24 * 60 * 60 * 1000,
  );
  const idempotenceKey = `appsub-initial:${params.subscriptionId}`;
  const payment = await prisma.appSubscriptionPayment.create({
    data: {
      subscriptionId: params.subscriptionId,
      userId: params.userId,
      provider: "YOOKASSA",
      kind: "INITIAL",
      status: "PENDING",
      amount: params.amountRub,
      currency: params.currency,
      periodStart,
      periodEnd,
      idempotenceKey,
      attemptCount: 1,
      lastAttemptAt: params.now,
      nextAttemptAt: params.now,
    },
    select: { id: true },
  });

  const returnUrl = `${params.origin.replace(/\/$/, "")}/subscription?paid=1`;
  const body = {
    amount: { value: params.amountRub.toFixed(2), currency: params.currency },
    capture: true,
    save_payment_method: true,
    confirmation: { type: "redirect" as const, return_url: returnUrl },
    description:
      `Подписка Gafus Premium ${params.amountRub.toFixed(2)} ` +
      `${params.currency}/${params.intervalDays} дн.`,
    metadata: {
      kind: "app_subscription",
      localPaymentId: payment.id,
      userId: params.userId,
      subscriptionId: params.subscriptionId,
      initial: "true",
    },
  };

  const auth = Buffer.from(`${params.shopId}:${params.secretKey}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(YOOKASSA_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        "Idempotence-Key": idempotenceKey,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    logger.error("YooKassa initial payment request failed (app subscription)", error as Error);
    await prisma.appSubscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        failureCode: "NETWORK",
        failureReason: "YooKassa request failed",
      },
    }).catch(() => undefined);
    await prisma.appSubscription.update({
      where: { id: params.subscriptionId },
      data: { status: "CANCELED" },
    }).catch(() => undefined);
    return { success: false, error: "Ошибка соединения с платёжной системой" };
  }

  if (!res.ok) {
    const text = await res.text();
    logger.error(
      "YooKassa rejected app subscription initial payment",
      new Error(`${res.status}: ${text}`),
    );
    await prisma.appSubscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        failureCode: "YOOKASSA_REJECTED",
        failureReason: `${res.status}: ${text}`.slice(0, 512),
      },
    }).catch(() => undefined);
    await prisma.appSubscription.update({
      where: { id: params.subscriptionId },
      data: { status: "CANCELED" },
    }).catch(() => undefined);
    return { success: false, error: "Платёжная система отклонила запрос" };
  }

  const data = (await res.json()) as {
    id?: string;
    confirmation?: { confirmation_url?: string };
  };
  const yookassaPaymentId = data.id ?? null;
  const confirmationUrl = data.confirmation?.confirmation_url ?? null;
  if (!yookassaPaymentId || !confirmationUrl) {
    logger.error(
      "YooKassa initial payment response has no id/confirmation_url",
      new Error(JSON.stringify(data)),
    );
    await prisma.appSubscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        failureCode: "BAD_RESPONSE",
        failureReason: "Missing payment id or confirmation URL",
      },
    }).catch(() => undefined);
    await prisma.appSubscription.update({
      where: { id: params.subscriptionId },
      data: { status: "CANCELED" },
    }).catch(() => undefined);
    return { success: false, error: "Неверный ответ платёжной системы" };
  }

  await prisma.appSubscriptionPayment.update({
    where: { id: payment.id },
    data: { yookassaPaymentId, confirmationUrl },
  });

  return { success: true, localSubscriptionId: params.subscriptionId, confirmationUrl };
}

async function findOrCreateYookassaSetupSubscription(params: {
  userId: string;
  now: Date;
}) {
  const lockKey = hashAdvisoryLockKey(`app-subscription:yookassa:start:${params.userId}`);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(
      `SELECT pg_advisory_xact_lock(${YOOKASSA_START_LOCK_NAMESPACE}, ${lockKey})`,
    );

    const existingSubscription = await tx.appSubscription.findFirst({
      where: {
        userId: params.userId,
        provider: "YOOKASSA",
        status: { in: ["ACTIVE", "PENDING", "PAST_DUE"] },
        OR: [
          {
            status: "PENDING",
            pendingExpiresAt: { gt: params.now },
          },
          { isLifetime: true },
          { currentPeriodEnd: { gt: params.now } },
        ],
      },
      orderBy: [{ isLifetime: "desc" }, { currentPeriodEnd: "desc" }],
      select: { id: true, status: true, yookassaPaymentMethodId: true },
    });

    if (existingSubscription) {
      return existingSubscription;
    }

    return tx.appSubscription.create({
      data: {
        userId: params.userId,
        provider: "YOOKASSA",
        status: "PENDING",
        pendingExpiresAt: new Date(params.now.getTime() + YOOKASSA_PENDING_SETUP_TTL_MS),
      },
      select: { id: true, status: true, yookassaPaymentMethodId: true },
    });
  });
}

export async function startYookassaAppSubscriptionPayment(params: {
  userId: string;
  origin: string;
  shopId: string;
  secretKey: string;
}): Promise<
  | { success: true; localSubscriptionId: string; confirmationUrl: string }
  | { success: false; error: string }
> {
  const settings = await prisma.appSubscriptionSettings.findUnique({
    where: { key: "default" },
    select: { yookassaWeeklyPriceRub: true, currency: true, intervalDays: true },
  });
  const amountRub = Number(settings?.yookassaWeeklyPriceRub ?? 200);
  const intervalDays = Number(settings?.intervalDays ?? 7);
  const currency = (settings?.currency ?? "RUB") as string;

  if (!Number.isFinite(amountRub) || amountRub <= 0) {
    return { success: false, error: "Некорректная цена подписки" };
  }
  if (!Number.isFinite(intervalDays) || intervalDays <= 0) {
    return { success: false, error: "Некорректный период подписки" };
  }

  const now = new Date();
  const yookassaTrial = await getYookassaTrialAvailability(params.userId);
  const subscription = await findOrCreateYookassaSetupSubscription({
    userId: params.userId,
    now,
  });

  if (subscription.status !== "PENDING" && subscription.yookassaPaymentMethodId) {
    return { success: false, error: "Карта уже привязана к подписке" };
  }

  if (!yookassaTrial.available) {
    return startInitialYookassaAppSubscriptionPayment({
      userId: params.userId,
      origin: params.origin,
      shopId: params.shopId,
      secretKey: params.secretKey,
      subscriptionId: subscription.id,
      amountRub,
      currency,
      intervalDays,
      now,
    });
  }

  const returnUrl = `${params.origin.replace(/\/$/, "")}/subscription?trial=1`;
  const body = {
    type: "bank_card",
    confirmation: { type: "redirect" as const, return_url: returnUrl },
    description: `Пробный период Gafus Premium 3 дня, далее ${amountRub.toFixed(2)} ${currency}/${intervalDays} дн.`,
    metadata: {
      kind: "app_subscription_payment_method",
      userId: params.userId,
      subscriptionId: subscription.id,
    },
  };

  const auth = Buffer.from(`${params.shopId}:${params.secretKey}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(YOOKASSA_PAYMENT_METHODS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        "Idempotence-Key": `appsub-pm:${subscription.id}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    logger.error("YooKassa payment method request failed (app subscription)", error as Error);
    await prisma.appSubscription.update({
      where: { id: subscription.id },
      data: { status: "CANCELED" },
    }).catch(() => undefined);
    return { success: false, error: "Ошибка соединения с платёжной системой" };
  }

  if (!res.ok) {
    const text = await res.text();
    logger.error("YooKassa rejected app subscription payment method request", new Error(`${res.status}: ${text}`));
    await prisma.appSubscription.update({
      where: { id: subscription.id },
      data: { status: "CANCELED" },
    }).catch(() => undefined);
    return { success: false, error: "Платёжная система отклонила запрос" };
  }

  const data = (await res.json()) as { id?: string; confirmation?: { confirmation_url?: string } };
  const paymentMethodId = data.id ?? null;
  const confirmationUrl = data.confirmation?.confirmation_url ?? null;
  if (!paymentMethodId || !confirmationUrl) {
    logger.error("YooKassa response has no id/confirmation_url", new Error(JSON.stringify(data)));
    await prisma.appSubscription.update({
      where: { id: subscription.id },
      data: { status: "CANCELED" },
    }).catch(() => undefined);
    return { success: false, error: "Неверный ответ платёжной системы" };
  }

  await prisma.appSubscription.update({
    where: { id: subscription.id },
    data: {
      yookassaPaymentMethodId: paymentMethodId,
      pendingExpiresAt: new Date(now.getTime() + YOOKASSA_PENDING_SETUP_TTL_MS),
    },
  });

  return { success: true, localSubscriptionId: subscription.id, confirmationUrl };
}

export async function reconcilePendingYookassaAppSubscription(params: {
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
      if (isYookassaPendingSetupExpired({
        pendingExpiresAt: subscription.pendingExpiresAt,
        now,
      })) {
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
    await activateYookassaPaymentMethodSubscription({
      subscription,
      paymentMethodId,
      providerPaymentMethod,
    });
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

export async function reconcileStaleYookassaPendingAppSubscriptions(params?: {
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
        await activateYookassaPaymentMethodSubscription({
          subscription: row,
          paymentMethodId,
          providerPaymentMethod,
        });
        activated += 1;
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
        logger.warn("Expiring stale pending YooKassa app subscription with missing provider method", {
          userId: row.userId,
          subscriptionId: row.id,
          paymentMethodId,
        });
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

export async function cancelYookassaAppSubscription(userId: string) {
  await prisma.appSubscription.updateMany({
    where: {
      userId,
      provider: "YOOKASSA",
      status: "ACTIVE",
    },
    data: {
      cancelAtPeriodEnd: true,
      canceledAt: new Date(),
      yookassaPaymentMethodId: null,
      yookassaPaymentMethodLast4: null,
      yookassaPaymentMethodTitle: null,
    },
  });
  return getAppSubscriptionAccess(userId);
}

export async function verifyAppleAppSubscription(_params: {
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
    return { success: false as const, code: "APPLE_VERIFY_FAILED", error: "Некорректный payload Apple" };
  }

  const settings = await prisma.appSubscriptionSettings.findUnique({
    where: { key: "default" },
    select: { appleProductId: true },
  });
  if (!settings?.appleProductId) {
    return { success: false as const, code: "CONFIG_APPLE_IAP", error: "Apple product id подписки не задан" };
  }
  if (settings.appleProductId !== productId) {
    return { success: false as const, code: "APPLE_PRODUCT_UNKNOWN", error: "Продукт подписки не совпадает" };
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

  const expiresDateMs = Number(payload.expiresDate ?? 0);
  const purchaseDateMs = Number(payload.purchaseDate ?? Date.now());
  const revocationDateMs = Number(payload.revocationDate ?? 0);
  const periodStart = Number.isFinite(purchaseDateMs) && purchaseDateMs > 0
    ? new Date(purchaseDateMs)
    : new Date();
  const periodEnd = Number.isFinite(expiresDateMs) && expiresDateMs > 0
    ? new Date(expiresDateMs)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const isRevoked = Number.isFinite(revocationDateMs) && revocationDateMs > 0;

  const existingPayment = await prisma.appSubscriptionPayment.findUnique({
    where: { appleTransactionId: transactionId },
    select: { id: true, userId: true, status: true },
  });
  if (existingPayment) {
    if (existingPayment.userId !== _params.userId) {
      return {
        success: false as const,
        code: "APPLE_TRANSACTION_CONFLICT",
        error: "Транзакция уже привязана к другому аккаунту",
      };
    }
    if (existingPayment.status === "SUCCEEDED") {
      return { success: true as const };
    }
    return {
      success: false as const,
      code: "APPLE_SUBSCRIPTION_INACTIVE",
      error: "Подписка Apple не активна",
    };
  }

  const existingSub = await prisma.appSubscription.findFirst({
    where: {
      OR: [
        { appleOriginalTransactionId: originalTransactionId },
        {
          userId: _params.userId,
          provider: "APPLE",
          status: { in: ["ACTIVE", "PENDING", "PAST_DUE"] },
        },
      ],
    },
    select: { id: true },
  });

  const nextStatus =
    isRevoked ? "REVOKED" : periodEnd > new Date() ? "ACTIVE" : "EXPIRED";

  await prisma.$transaction(async (tx) => {
    const subscriptionId = existingSub
      ? existingSub.id
      : (
          await tx.appSubscription.create({
            data: {
              userId: _params.userId,
              provider: "APPLE",
              status: nextStatus,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              appleOriginalTransactionId: originalTransactionId,
              appleProductId: productId,
            },
            select: { id: true },
          })
        ).id;

    if (existingSub) {
      await tx.appSubscription.update({
        where: { id: existingSub.id },
        data: {
          status: nextStatus,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          appleOriginalTransactionId: originalTransactionId,
          appleProductId: productId,
        },
      });
    }

    await tx.appSubscriptionPayment.create({
      data: {
        subscriptionId,
        userId: _params.userId,
        provider: "APPLE",
        kind: "INITIAL",
        status: nextStatus === "ACTIVE" ? "SUCCEEDED" : "CANCELED",
        amount: null,
        currency: payload.currency ?? null,
        periodStart,
        periodEnd,
        idempotenceKey: `apple:${transactionId}`,
        appleTransactionId: transactionId,
        appleOriginalTransactionId: originalTransactionId,
        applePriceMilliunits:
          typeof payload.price === "number" ? Number(payload.price) : null,
        appleStorefront: payload.storefront ?? null,
        appleEnvironment: payload.environment ?? null,
        appleWebOrderLineItemId:
          payload.webOrderLineItemId != null ? String(payload.webOrderLineItemId) : null,
        succeededAt: nextStatus === "ACTIVE" ? new Date() : null,
      },
    });
  });

  if (nextStatus !== "ACTIVE") {
    return {
      success: false as const,
      code: "APPLE_SUBSCRIPTION_INACTIVE",
      error: "Подписка Apple не активна",
    };
  }

  return { success: true as const };
}

export async function restoreAppleAppSubscription(_params: {
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
    return { success: false as const, code: "APPLE_RESTORE_INPUT_REQUIRED", error: "Требуется originalTransactionId или signedTransactionInfo" };
  }

  const subscription = await prisma.appSubscription.findFirst({
    where: {
      userId: _params.userId,
      provider: "APPLE",
      appleOriginalTransactionId: _params.originalTransactionId,
    },
    select: { id: true, currentPeriodEnd: true, isLifetime: true },
  });

  if (!subscription) {
    return { success: false as const, code: "APPLE_RESTORE_NOT_FOUND", error: "Подписка не найдена" };
  }

  const status =
    subscription.isLifetime ||
    (subscription.currentPeriodEnd && subscription.currentPeriodEnd > new Date())
      ? "ACTIVE"
      : "EXPIRED";
  await prisma.appSubscription.update({
    where: { id: subscription.id },
    data: { status },
  });

  return { success: true as const };
}

export async function handleYookassaAppSubscriptionWebhook(params: {
  event: string;
  yookassaPaymentId: string;
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
  const providerEventKey = params.providerEventKey ?? `${params.event}:${params.yookassaPaymentId}`;
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
      });

      if (eventId) {
        await prisma.appSubscriptionEvent.update({
          where: { id: eventId },
          data: { processingStatus: "PROCESSED", processedAt: new Date(), userId: subscription.userId, subscriptionId: subscription.id },
        }).catch(() => undefined);
      }
    } catch (error) {
      if (eventId) {
        await prisma.appSubscriptionEvent.update({
          where: { id: eventId },
          data: {
            processingStatus: "FAILED",
            lastProcessingError: error instanceof Error ? error.message : String(error),
            processingAttempts: { increment: 1 },
          },
        }).catch(() => undefined);
      }
      throw error;
    }

    return { userId: subscription.userId };
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
      amount: true,
      currency: true,
      subscription: { select: { currentPeriodEnd: true } },
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
  if (payment.status === "SUCCEEDED") {
    if (eventId) {
      await prisma.appSubscriptionEvent.update({
        where: { id: eventId },
        data: { processingStatus: "PROCESSED", processedAt: new Date(), userId: payment.userId },
      }).catch(() => undefined);
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
      const providerPaymentMethodId = providerPayment.payment_method?.id ?? params.paymentMethodId;
      const providerPaymentMethodLast4 =
        providerPayment.payment_method?.card?.last4 ?? params.paymentMethodLast4;
      const providerPaymentMethodTitle =
        providerPayment.payment_method?.title ?? params.paymentMethodTitle;
      const settings = await prisma.appSubscriptionSettings.findUnique({
        where: { key: "default" },
        select: { intervalDays: true },
      });
      const intervalDays = Number(settings?.intervalDays ?? 7);
      const now = new Date();
      const currentPeriodEnd = payment.subscription?.currentPeriodEnd;
      const periodStart = currentPeriodEnd && currentPeriodEnd > now ? currentPeriodEnd : now;
      const periodEnd = new Date(periodStart.getTime() + intervalDays * 24 * 60 * 60 * 1000);

      await prisma.$transaction(async (tx) => {
        await tx.appSubscriptionPayment.update({
          where: { id: payment.id },
          data: {
            status: "SUCCEEDED",
            yookassaPaymentId: params.yookassaPaymentId,
            amount: params.amount ? Number(params.amount) : undefined,
            currency: "RUB",
            periodStart,
            periodEnd,
            succeededAt: now,
          },
        });

        if (payment.subscriptionId) {
          await tx.appSubscription.update({
            where: { id: payment.subscriptionId },
            data: {
              status: "ACTIVE",
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              pendingExpiresAt: null,
              cancelAtPeriodEnd: false,
              ...(providerPaymentMethodId
                ? { yookassaPaymentMethodId: providerPaymentMethodId }
                : {}),
              ...(providerPaymentMethodLast4
                ? { yookassaPaymentMethodLast4: providerPaymentMethodLast4 }
                : {}),
              ...(providerPaymentMethodTitle
                ? { yookassaPaymentMethodTitle: providerPaymentMethodTitle }
                : {}),
              renewalReminderSentForPeriodEnd: null,
            },
          });
        } else {
          const created = await tx.appSubscription.create({
            data: {
              userId: payment.userId,
              provider: "YOOKASSA",
              status: "ACTIVE",
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              pendingExpiresAt: null,
              ...(providerPaymentMethodId
                ? { yookassaPaymentMethodId: providerPaymentMethodId }
                : {}),
              ...(providerPaymentMethodLast4
                ? { yookassaPaymentMethodLast4: providerPaymentMethodLast4 }
                : {}),
              ...(providerPaymentMethodTitle
                ? { yookassaPaymentMethodTitle: providerPaymentMethodTitle }
                : {}),
            },
            select: { id: true },
          });
          await tx.appSubscriptionPayment.update({
            where: { id: payment.id },
            data: { subscriptionId: created.id },
          });
        }
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
      await prisma.appSubscriptionPayment.update({
        where: { id: payment.id },
        data: { status: "CANCELED", yookassaPaymentId: params.yookassaPaymentId },
      });
    } else if (params.event === "refund.succeeded") {
      logger.warn("App subscription refund webhook ignored until refund verification is implemented", {
        localPaymentId,
        yookassaPaymentId: params.yookassaPaymentId,
      });
    }

    if (eventId) {
      await prisma.appSubscriptionEvent.update({
        where: { id: eventId },
        data: { processingStatus: "PROCESSED", processedAt: new Date(), userId: payment.userId },
      }).catch(() => undefined);
    }
  } catch (error) {
    if (eventId) {
      await prisma.appSubscriptionEvent.update({
        where: { id: eventId },
        data: {
          processingStatus: "FAILED",
          lastProcessingError: error instanceof Error ? error.message : String(error),
          processingAttempts: { increment: 1 },
        },
      }).catch(() => undefined);
    }
    throw error;
  }

  return { userId: payment.userId };
}

export async function handleAppleAppSubscriptionNotification(params: {
  signedPayload: string;
}) {
  const verifierOrErr = getAppleVerifier();
  if (!(verifierOrErr instanceof SignedDataVerifier)) {
    return { success: false as const, error: verifierOrErr.message, code: verifierOrErr.code };
  }

  const decoded = await verifierOrErr.verifyAndDecodeNotification(params.signedPayload);
  const eventType = decoded.notificationType ?? "UNKNOWN";
  const subtype = decoded.subtype ?? null;
  const notificationUUID = decoded.notificationUUID ?? null;
  const signedTransactionInfo =
    decoded.data?.signedTransactionInfo ?? decoded.data?.signedRenewalInfo ?? null;

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
    } catch {
      logger.warn("Duplicate app-subscription Apple notification", {
        metric: "webhook_duplicate_total",
        source: "APPLE",
        providerEventKey: notificationUUID,
      });
      return { success: true as const, duplicate: true };
    }
  }

  if (signedTransactionInfo) {
    // userId unknown from notification alone; transaction JWS carries appAccountToken/originalTx.
    // In v1, try to find user by original transaction id after decoding transaction.
    const tx = await verifierOrErr.verifyAndDecodeTransaction(signedTransactionInfo);
    const originalTransactionId = tx.originalTransactionId?.trim();
    const candidate = originalTransactionId
      ? await prisma.appSubscription.findFirst({
          where: {
            provider: "APPLE",
            appleOriginalTransactionId: originalTransactionId,
          },
          select: { userId: true },
        })
      : null;

    if (candidate?.userId) {
      await verifyAppleAppSubscription({
        userId: candidate.userId,
        signedTransactionInfo,
      });
    }
  }

  return { success: true as const };
}
