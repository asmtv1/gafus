import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { Environment, SignedDataVerifier, Type } from "@apple/app-store-server-library";

import { getAppSubscriptionAccess } from "./accessService";

const logger = createWebLogger("app-subscription-payment-service");
const YOOKASSA_API = "https://api.yookassa.ru/v3/payments";
const APPLE_ROOT_CA_G3_DER_BASE64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";

let appleVerifierSingleton: SignedDataVerifier | null = null;
let appleVerifierConfigKey: string | null = null;

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
    throw new Error(`YooKassa payment verification failed: ${response.status} ${text}`.slice(0, 512));
  }
  return (await response.json()) as YooKassaPaymentObject;
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

function assertYookassaPaymentConfirmed(params: Parameters<typeof assertYookassaPaymentBelongsToLocalPayment>[0]) {
  assertYookassaPaymentBelongsToLocalPayment(params);
  if (params.providerPayment.status !== "succeeded" || params.providerPayment.paid !== true) {
    throw new Error("YooKassa payment is not confirmed");
  }
}

function assertYookassaPaymentCanceled(params: Parameters<typeof assertYookassaPaymentBelongsToLocalPayment>[0]) {
  assertYookassaPaymentBelongsToLocalPayment(params);
  if (params.providerPayment.status !== "canceled") {
    throw new Error("YooKassa payment is not canceled");
  }
}

export async function startYookassaAppSubscriptionPayment(params: {
  userId: string;
  origin: string;
  shopId: string;
  secretKey: string;
}): Promise<
  | { success: true; localPaymentId: string; confirmationUrl: string }
  | { success: false; error: string }
> {
  const settings = await (prisma as any).appSubscriptionSettings.findUnique({
    where: { key: "default" },
    select: { yookassaWeeklyPriceRub: true, currency: true, intervalDays: true },
  });
  const amountRub = Number(settings?.yookassaWeeklyPriceRub ?? 200);
  const intervalDays = Number(settings?.intervalDays ?? 7);
  const currency = (settings?.currency ?? "RUB") as string;

  if (!Number.isFinite(amountRub) || amountRub <= 0) {
    return { success: false, error: "Некорректная цена подписки" };
  }

  const now = new Date();
  const existingSubscription = await (prisma as any).appSubscription.findFirst({
    where: {
      userId: params.userId,
      provider: "YOOKASSA",
      status: { in: ["ACTIVE", "PENDING", "PAST_DUE"] },
      OR: [{ isLifetime: true }, { currentPeriodEnd: { gt: now } }],
    },
    orderBy: [{ isLifetime: "desc" }, { currentPeriodEnd: "desc" }],
    select: { id: true },
  });

  const payment = await (prisma as any).appSubscriptionPayment.create({
    data: {
      subscriptionId: existingSubscription?.id ?? undefined,
      userId: params.userId,
      provider: "YOOKASSA",
      kind: "INITIAL",
      status: "PENDING",
      idempotenceKey: `appsub:${params.userId}:${Date.now()}`,
      amount: amountRub,
      currency,
    },
    select: {
      id: true,
    },
  });

  const returnUrl = `${params.origin.replace(/\/$/, "")}/subscription?paid=1`;
  const body = {
    amount: { value: amountRub.toFixed(2), currency },
    capture: true,
    save_payment_method: true,
    confirmation: { type: "redirect" as const, return_url: returnUrl },
    description: `Подписка Gafus Premium (${intervalDays} дн.)`,
    metadata: {
      kind: "app_subscription",
      localPaymentId: payment.id,
      userId: params.userId,
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
        "Idempotence-Key": payment.id,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    logger.error("YooKassa request failed (app subscription)", error as Error);
    await (prisma as any).appSubscriptionPayment.update({
      where: { id: payment.id },
      data: { status: "CANCELED", failureCode: "NETWORK_ERROR", failureReason: "YooKassa connection failed" },
    }).catch(() => undefined);
    return { success: false, error: "Ошибка соединения с платёжной системой" };
  }

  if (!res.ok) {
    const text = await res.text();
    logger.error("YooKassa rejected app subscription request", new Error(`${res.status}: ${text}`));
    await (prisma as any).appSubscriptionPayment.update({
      where: { id: payment.id },
      data: { status: "CANCELED", failureCode: "YOOKASSA_REJECTED", failureReason: `${res.status}` },
    }).catch(() => undefined);
    return { success: false, error: "Платёжная система отклонила запрос" };
  }

  const data = (await res.json()) as { id?: string; confirmation?: { confirmation_url?: string } };
  const yookassaPaymentId = data.id ?? null;
  const confirmationUrl = data.confirmation?.confirmation_url ?? null;
  if (!yookassaPaymentId || !confirmationUrl) {
    logger.error("YooKassa response has no id/confirmation_url", new Error(JSON.stringify(data)));
    await (prisma as any).appSubscriptionPayment.update({
      where: { id: payment.id },
      data: { status: "CANCELED", failureCode: "INVALID_PROVIDER_RESPONSE", failureReason: "Missing confirmation_url" },
    }).catch(() => undefined);
    return { success: false, error: "Неверный ответ платёжной системы" };
  }

  await (prisma as any).appSubscriptionPayment.update({
    where: { id: payment.id },
    data: { yookassaPaymentId, confirmationUrl },
  });

  return { success: true, localPaymentId: payment.id, confirmationUrl };
}

export async function cancelYookassaAppSubscription(userId: string) {
  await (prisma as any).appSubscription.updateMany({
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

  const settings = await (prisma as any).appSubscriptionSettings.findUnique({
    where: { key: "default" },
    select: { appleProductId: true },
  });
  if (settings?.appleProductId && settings.appleProductId !== productId) {
    return { success: false as const, code: "APPLE_PRODUCT_UNKNOWN", error: "Продукт подписки не совпадает" };
  }

  const user = await (prisma as any).user.findUnique({
    where: { id: _params.userId },
    select: { appleAppAccountToken: true },
  });
  const payloadAppAccountToken =
    typeof (payload as { appAccountToken?: unknown }).appAccountToken === "string"
      ? ((payload as { appAccountToken?: string }).appAccountToken ?? "").trim()
      : "";
  if (
    user?.appleAppAccountToken &&
    payloadAppAccountToken &&
    user.appleAppAccountToken !== payloadAppAccountToken
  ) {
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

  const existingPayment = await (prisma as any).appSubscriptionPayment.findUnique({
    where: { appleTransactionId: transactionId },
    select: { id: true, userId: true },
  });
  if (existingPayment) {
    if (existingPayment.userId !== _params.userId) {
      return {
        success: false as const,
        code: "APPLE_TRANSACTION_CONFLICT",
        error: "Транзакция уже привязана к другому аккаунту",
      };
    }
    return { success: true as const };
  }

  const existingSub = await (prisma as any).appSubscription.findFirst({
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

  await (prisma as any).$transaction(async (tx: any) => {
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

  const subscription = await (prisma as any).appSubscription.findFirst({
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
  await (prisma as any).appSubscription.update({
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
    const event = await (prisma as any).appSubscriptionEvent.create({
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

    const existingEvent = await (prisma as any).appSubscriptionEvent.findFirst({
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

  const localPaymentId = metadata?.localPaymentId;
  if (!localPaymentId) {
    logger.warn("App subscription webhook without localPaymentId", {
      yookassaPaymentId: params.yookassaPaymentId,
      event: params.event,
    });
    return { userId: null };
  }

  const payment = await (prisma as any).appSubscriptionPayment.findUnique({
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
      await (prisma as any).appSubscriptionEvent.update({
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
      const settings = await (prisma as any).appSubscriptionSettings.findUnique({
        where: { key: "default" },
        select: { intervalDays: true },
      });
      const intervalDays = Number(settings?.intervalDays ?? 7);
      const now = new Date();
      const currentPeriodEnd = payment.subscription?.currentPeriodEnd;
      const periodStart = currentPeriodEnd && currentPeriodEnd > now ? currentPeriodEnd : now;
      const periodEnd = new Date(periodStart.getTime() + intervalDays * 24 * 60 * 60 * 1000);

      await (prisma as any).$transaction(async (tx: any) => {
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
              cancelAtPeriodEnd: false,
              ...(providerPaymentMethodId ? { yookassaPaymentMethodId: providerPaymentMethodId } : {}),
              ...(providerPaymentMethodLast4 ? { yookassaPaymentMethodLast4: providerPaymentMethodLast4 } : {}),
              ...(providerPaymentMethodTitle ? { yookassaPaymentMethodTitle: providerPaymentMethodTitle } : {}),
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
              ...(providerPaymentMethodId ? { yookassaPaymentMethodId: providerPaymentMethodId } : {}),
              ...(providerPaymentMethodLast4 ? { yookassaPaymentMethodLast4: providerPaymentMethodLast4 } : {}),
              ...(providerPaymentMethodTitle ? { yookassaPaymentMethodTitle: providerPaymentMethodTitle } : {}),
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
      await (prisma as any).appSubscriptionPayment.update({
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
      await (prisma as any).appSubscriptionEvent.update({
        where: { id: eventId },
        data: { processingStatus: "PROCESSED", processedAt: new Date(), userId: payment.userId },
      }).catch(() => undefined);
    }
  } catch (error) {
    if (eventId) {
      await (prisma as any).appSubscriptionEvent.update({
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
      await (prisma as any).appSubscriptionEvent.create({
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
    } catch (_error) {
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
      ? await (prisma as any).appSubscription.findFirst({
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
