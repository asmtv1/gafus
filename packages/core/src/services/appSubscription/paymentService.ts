import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { Prisma, prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  Status as AppleSubscriptionStatus,
  Type,
} from "@apple/app-store-server-library";

import { getAppSubscriptionAccess } from "./accessService";
import {
  findAppSubscriptionPlanByAppleProductId,
  findAppSubscriptionPlanConfig,
  getAppSubscriptionPlanConfig,
  isPromoEligibleAppSubscriptionPlanCode,
  isPublicAppSubscriptionPlanCode,
  normalizeAppSubscriptionPlanCode,
  type AppSubscriptionPlanCode,
} from "./plans";
import {
  findYookassaTrialByPaymentMethodFingerprintHash,
  recordYookassaTrialUnavailable,
  recordYookassaTrialStarted,
  YOOKASSA_TRIAL_UNAVAILABLE_CARD_FINGERPRINT_REUSED,
  YOOKASSA_TRIAL_DAYS,
} from "./trialService";
import {
  AppSubscriptionPromoCodeDomainError,
  isAppSubscriptionPromoCodeEntryEnabled,
  type AppSubscriptionPromoCodeDomainErrorCode,
} from "./promoCodeService";
import { calculateAppSubscriptionPromoPrice, parseAppSubscriptionPromoCode } from "./promoCode";
import { ensureNpdReceiptForSucceededPayment, queueNpdReceiptCancellation } from "./npdReceiptService";
import { recordPartnerCommissionForPayment, reversePartnerCommissionForRefund } from "./partnerService";
import type { ClientAppContext } from "../appFeatureFlags";

const logger = createWebLogger("app-subscription-payment-service");
const YOOKASSA_API = "https://api.yookassa.ru/v3/payments";
const YOOKASSA_PAYMENT_METHODS_API = "https://api.yookassa.ru/v3/payment_methods";
const YOOKASSA_REFUNDS_API = "https://api.yookassa.ru/v3/refunds";
const YOOKASSA_PENDING_SETUP_TTL_MS = 60 * 60 * 1000;
const YOOKASSA_START_LOCK_NAMESPACE = 90210018;
const APPLE_ROOT_CA_G3_DER_BASE64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";

let appleVerifierSingleton: SignedDataVerifier | null = null;
let appleVerifierConfigKey: string | null = null;
let appleServerApiClientSingleton: AppStoreServerAPIClient | null = null;
let appleServerApiClientConfigKey: string | null = null;

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

function getAppleVerifier(): SignedDataVerifier | { ok: false; code: string; message: string } {
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
    return {
      ok: false,
      code: "CONFIG_APPLE_IAP",
      message: "Для production требуется APPLE_APP_ID",
    };
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

function getAppleEnvironment():
  | { ok: true; bundleId: string; environment: Environment; appAppleId?: number }
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
    return {
      ok: false,
      code: "CONFIG_APPLE_IAP",
      message: "Для production требуется APPLE_APP_ID",
    };
  }

  return { ok: true, bundleId, environment, appAppleId };
}

function getApplePrivateKey():
  | { ok: true; privateKey: string; sourceKey: string }
  | { ok: false; code: string; message: string } {
  const inlineKey = process.env.APPLE_PRIVATE_KEY?.trim();
  if (inlineKey) {
    return {
      ok: true,
      privateKey: inlineKey.replace(/\\n/g, "\n"),
      sourceKey: `inline:${inlineKey.length}`,
    };
  }

  const privateKeyPath = process.env.APPLE_PRIVATE_KEY_PATH?.trim();
  if (!privateKeyPath) {
    return {
      ok: false,
      code: "CONFIG_APPLE_SERVER_API",
      message: "APPLE_PRIVATE_KEY или APPLE_PRIVATE_KEY_PATH не задан",
    };
  }

  try {
    return {
      ok: true,
      privateKey: readFileSync(privateKeyPath, "utf8"),
      sourceKey: `path:${privateKeyPath}`,
    };
  } catch {
    return {
      ok: false,
      code: "CONFIG_APPLE_SERVER_API",
      message: "Не удалось прочитать APPLE_PRIVATE_KEY_PATH",
    };
  }
}

function getAppleServerApiClient():
  | AppStoreServerAPIClient
  | { ok: false; code: string; message: string } {
  const env = getAppleEnvironment();
  if (!env.ok) return env;

  const issuerId = process.env.APPLE_ISSUER_ID?.trim();
  const keyId = process.env.APPLE_KEY_ID?.trim();
  if (!issuerId || !keyId) {
    return {
      ok: false,
      code: "CONFIG_APPLE_SERVER_API",
      message: "APPLE_ISSUER_ID или APPLE_KEY_ID не задан",
    };
  }

  const privateKey = getApplePrivateKey();
  if (!privateKey.ok) return privateKey;

  const configKey = [env.bundleId, env.environment, issuerId, keyId, privateKey.sourceKey].join(
    "|",
  );
  if (appleServerApiClientSingleton && appleServerApiClientConfigKey === configKey) {
    return appleServerApiClientSingleton;
  }

  appleServerApiClientSingleton = new AppStoreServerAPIClient(
    privateKey.privateKey,
    keyId,
    issuerId,
    env.bundleId,
    env.environment,
  );
  appleServerApiClientConfigKey = configKey;
  return appleServerApiClientSingleton;
}

function isAutoRenewableType(type: unknown): boolean {
  return type === Type.AUTO_RENEWABLE_SUBSCRIPTION || type === "Auto-Renewable Subscription";
}

function appleMilliunitsToAmount(price: unknown): number | null {
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) return null;
  return Number((price / 1000).toFixed(3));
}

function msToDate(value: unknown): Date | null {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n);
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
    type?: string;
    title?: string;
    card?: { last4?: string };
  };
};

type YooKassaRefundObject = {
  id?: string;
  status?: string;
  payment_id?: string;
  amount?: { value?: string; currency?: string };
};

type YooKassaBankCardDetails = {
  first6?: string;
  last4?: string;
  expiry_month?: string;
  expiry_year?: string;
  card_type?: string;
  issuer_country?: string;
  issuer_name?: string;
};

type YooKassaPaymentMethodObject = {
  id?: string;
  status?: string;
  saved?: boolean;
  type?: string;
  title?: string;
  card?: YooKassaBankCardDetails;
  metadata?: Record<string, string | undefined>;
  confirmation?: { confirmation_url?: string };
};

function getYookassaPaymentMethodDisplayTitle(params: {
  type?: string | null;
  title?: string | null;
  last4?: string | null;
}): string | null {
  if (params.type?.trim().toLowerCase() === "sbp") {
    return "СБП";
  }
  const title = params.title?.trim();
  if (title) return title;
  const last4 = params.last4?.trim();
  return last4 ? `Карта *${last4}` : null;
}

function normalizeFingerprintPart(
  value: string | undefined,
  casing: "lower" | "upper" | "keep" = "keep",
): string {
  const normalized = (value ?? "").trim();
  if (casing === "lower") return normalized.toLowerCase();
  if (casing === "upper") return normalized.toUpperCase();
  return normalized;
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

async function fetchYookassaRefundObject(params: {
  yookassaRefundId: string;
  shopId?: string;
  secretKey?: string;
}): Promise<YooKassaRefundObject> {
  const { shopId, secretKey } = getYookassaCredentials(params);
  const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  const response = await fetch(`${YOOKASSA_REFUNDS_API}/${encodeURIComponent(params.yookassaRefundId)}`, {
    method: "GET",
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new YookassaHttpError(`YooKassa refund verification failed: ${response.status} ${text}`.slice(0, 512), response.status);
  }
  return (await response.json()) as YooKassaRefundObject;
}

async function fetchYookassaPaymentMethodObject(params: {
  paymentMethodId: string;
  shopId?: string;
  secretKey?: string;
}): Promise<YooKassaPaymentMethodObject> {
  const { shopId, secretKey } = getYookassaCredentials(params);
  const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  const response = await fetch(
    `${YOOKASSA_PAYMENT_METHODS_API}/${encodeURIComponent(params.paymentMethodId)}`,
    {
      method: "GET",
      headers: { Authorization: `Basic ${auth}` },
    },
  );
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
    planCode?: string | null;
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
  if (
    providerPayment.metadata?.planCode &&
    params.localPayment.planCode &&
    providerPayment.metadata.planCode !== params.localPayment.planCode
  ) {
    throw new Error("YooKassa payment metadata planCode mismatch");
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
  fingerprintSecret?: string;
}): Promise<
  | { activated: true }
  | { activated: false; reason: typeof YOOKASSA_TRIAL_UNAVAILABLE_CARD_FINGERPRINT_REUSED }
> {
  const now = new Date();
  const hasCurrentAccess =
    params.subscription.status === "ACTIVE" &&
    (params.subscription.isLifetime === true ||
      (params.subscription.currentPeriodEnd instanceof Date &&
        params.subscription.currentPeriodEnd > now));
  const periodStart = hasCurrentAccess ? params.subscription.currentPeriodStart : now;
  const periodEnd = hasCurrentAccess
    ? params.subscription.currentPeriodEnd
    : new Date(now.getTime() + YOOKASSA_TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const paymentMethodFingerprintHash = getYookassaPaymentMethodFingerprintHash({
    providerPaymentMethod: params.providerPaymentMethod,
    fallbackSecret: params.fingerprintSecret,
  });
  const paymentMethodDisplayTitle = getYookassaPaymentMethodDisplayTitle({
    type: params.providerPaymentMethod.type,
    title: params.providerPaymentMethod.title,
    last4: params.providerPaymentMethod.card?.last4,
  });

  return prisma.$transaction(async (tx) => {
    if (!hasCurrentAccess && paymentMethodFingerprintHash) {
      const existingTrial = await findYookassaTrialByPaymentMethodFingerprintHash({
        userId: params.subscription.userId,
        paymentMethodFingerprintHash,
        tx,
      });

      if (existingTrial) {
        await tx.appSubscription.update({
          where: { id: params.subscription.id },
          data: {
            status: "CANCELED",
            currentPeriodStart: null,
            currentPeriodEnd: null,
            pendingExpiresAt: null,
            cancelAtPeriodEnd: false,
            yookassaPaymentMethodId: null,
            ...(params.providerPaymentMethod.card?.last4
              ? { yookassaPaymentMethodLast4: params.providerPaymentMethod.card.last4 }
              : {}),
            ...(paymentMethodDisplayTitle
              ? { yookassaPaymentMethodTitle: paymentMethodDisplayTitle }
              : {}),
            renewalReminderSentForPeriodEnd: null,
          },
        });
        await recordYookassaTrialUnavailable({
          userId: params.subscription.userId,
          subscriptionId: params.subscription.id,
          at: now,
          paymentMethodFingerprintHash,
          reason: YOOKASSA_TRIAL_UNAVAILABLE_CARD_FINGERPRINT_REUSED,
          tx,
        });
        return {
          activated: false,
          reason: YOOKASSA_TRIAL_UNAVAILABLE_CARD_FINGERPRINT_REUSED,
        };
      }
    }

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
        ...(paymentMethodDisplayTitle
          ? { yookassaPaymentMethodTitle: paymentMethodDisplayTitle }
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
        paymentMethodFingerprintHash,
        tx,
      });
    }

    return { activated: true };
  });
}

async function startYookassaAppSubscriptionTrialBinding(params: {
  userId: string;
  origin: string;
  shopId: string;
  secretKey: string;
  subscriptionId: string;
  amountRub: number;
  currency: string;
  intervalDays: number;
  planCode: AppSubscriptionPlanCode;
  now: Date;
}): Promise<
  | { success: true; localSubscriptionId: string; confirmationUrl: string }
  | { success: false; error: string }
> {
  const returnUrl = `${params.origin.replace(/\/$/, "")}/subscription?trial=1`;
  const body = {
    // Подписка оформляется только через СБП: не даём странице ЮKassa показывать другие методы.
    type: "sbp" as const,
    confirmation: { type: "redirect" as const, return_url: returnUrl },
    description:
      `Пробный период Gafus Premium ${YOOKASSA_TRIAL_DAYS} дня, далее ` +
      `${params.amountRub.toFixed(2)} ${params.currency}/${params.intervalDays} дн.`,
    metadata: {
      kind: "app_subscription_payment_method",
      userId: params.userId,
      subscriptionId: params.subscriptionId,
      planCode: params.planCode,
    },
  };

  const auth = Buffer.from(`${params.shopId}:${params.secretKey}`).toString("base64");
  let response: Response;
  try {
    response = await fetch(YOOKASSA_PAYMENT_METHODS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        "Idempotence-Key": `appsub-pm:${randomUUID()}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    logger.error("YooKassa payment method request failed (app subscription)", error as Error);
    await prisma.appSubscription
      .update({
        where: { id: params.subscriptionId },
        data: { status: "CANCELED" },
      })
      .catch(() => undefined);
    return { success: false, error: "Ошибка соединения с платёжной системой" };
  }

  if (!response.ok) {
    const text = await response.text();
    logger.error(
      "YooKassa rejected app subscription payment method request",
      new Error(`${response.status}: ${text}`),
    );
    await prisma.appSubscription
      .update({
        where: { id: params.subscriptionId },
        data: { status: "CANCELED" },
      })
      .catch(() => undefined);
    return { success: false, error: "Платёжная система отклонила запрос" };
  }

  const data = (await response.json()) as {
    id?: string;
    confirmation?: { confirmation_url?: string };
  };
  const paymentMethodId = data.id ?? null;
  const confirmationUrl = data.confirmation?.confirmation_url ?? null;
  if (!paymentMethodId || !confirmationUrl) {
    logger.error(
      "YooKassa payment method response has no id/confirmation_url",
      new Error(JSON.stringify(data)),
    );
    await prisma.appSubscription
      .update({
        where: { id: params.subscriptionId },
        data: { status: "CANCELED" },
      })
      .catch(() => undefined);
    return { success: false, error: "Неверный ответ платёжной системы" };
  }

  await prisma.appSubscription.update({
    where: { id: params.subscriptionId },
    data: {
      yookassaPaymentMethodId: paymentMethodId,
      pendingExpiresAt: new Date(params.now.getTime() + YOOKASSA_PENDING_SETUP_TTL_MS),
    },
  });

  return { success: true, localSubscriptionId: params.subscriptionId, confirmationUrl };
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
  planCode: AppSubscriptionPlanCode;
  now: Date;
  preparedPayment?: {
    id: string;
    idempotenceKey: string;
    amountRub: number;
    promoCodeSnapshot: string | null;
    promoDiscountPercent: number | null;
  };
}): Promise<
  | { success: true; localSubscriptionId: string; confirmationUrl: string }
  | { success: false; error: string }
> {
  const periodStart = params.now;
  const periodEnd = new Date(params.now.getTime() + params.intervalDays * 24 * 60 * 60 * 1000);
  const idempotenceKey = params.preparedPayment?.idempotenceKey ?? `appsub-init:${randomUUID()}`;
  const payment = params.preparedPayment ??
    (await prisma.appSubscriptionPayment.create({
      data: {
        subscriptionId: params.subscriptionId,
        userId: params.userId,
        provider: "YOOKASSA",
        kind: "INITIAL",
        status: "PENDING",
        planCode: params.planCode,
        amount: params.amountRub,
        originalAmount: params.amountRub,
        currency: params.currency,
        periodStart,
        periodEnd,
        idempotenceKey,
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
    }));
  const chargedAmountRub = Number(
    params.preparedPayment && Number.isFinite(params.preparedPayment.amountRub)
      ? params.preparedPayment.amountRub
      : params.amountRub,
  );

  const returnUrl = `${params.origin.replace(/\/$/, "")}/subscription?paid=1`;
  const body = {
    amount: { value: chargedAmountRub.toFixed(2), currency: params.currency },
    capture: true,
    save_payment_method: true,
    // Do not force a method: YooKassa shows the methods enabled for the shop,
    // including SBP and bank cards. A chosen card is saved for renewals.
    confirmation: { type: "redirect" as const, return_url: returnUrl },
    description:
      `Подписка Gafus Premium ${chargedAmountRub.toFixed(2)} ` +
      `${params.currency}/${params.intervalDays} дн.`,
    metadata: {
      kind: "app_subscription",
      localPaymentId: payment.id,
      userId: params.userId,
      subscriptionId: params.subscriptionId,
      planCode: params.planCode,
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
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        "Idempotence-Key": idempotenceKey,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    logger.error("YooKassa initial payment request failed (app subscription)", error as Error);
    await prisma.appSubscriptionPayment
      .update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          failureCode: "NETWORK",
          failureReason: "YooKassa request failed",
        },
      })
      .catch(() => undefined);
    await prisma.appSubscription
      .update({
        where: { id: params.subscriptionId },
        data: { status: "CANCELED" },
      })
      .catch(() => undefined);
    return { success: false, error: "Ошибка соединения с платёжной системой" };
  }

  if (!res.ok) {
    const text = await res.text();
    logger.error(
      "YooKassa rejected app subscription initial payment",
      new Error(`${res.status}: ${text}`),
    );
    await prisma.appSubscriptionPayment
      .update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          failureCode: "YOOKASSA_REJECTED",
          failureReason: `${res.status}: ${text}`.slice(0, 512),
        },
      })
      .catch(() => undefined);
    await prisma.appSubscription
      .update({
        where: { id: params.subscriptionId },
        data: { status: "CANCELED" },
      })
      .catch(() => undefined);
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
    await prisma.appSubscriptionPayment
      .update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          failureCode: "BAD_RESPONSE",
          failureReason: "Missing payment id or confirmation URL",
        },
      })
      .catch(() => undefined);
    await prisma.appSubscription
      .update({
        where: { id: params.subscriptionId },
        data: { status: "CANCELED" },
      })
      .catch(() => undefined);
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
  planCode: AppSubscriptionPlanCode;
  now: Date;
}) {
  const lockKey = hashAdvisoryLockKey(`app-subscription:yookassa:start:${params.userId}`);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(${YOOKASSA_START_LOCK_NAMESPACE}, ${lockKey})`,
    );

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

    if (existingSubscription) {
      if (existingSubscription.status === "PENDING") {
        return tx.appSubscription.update({
          where: { id: existingSubscription.id },
          data: {
            planCode: params.planCode,
            pendingExpiresAt: new Date(params.now.getTime() + YOOKASSA_PENDING_SETUP_TTL_MS),
            yookassaPaymentMethodId: null,
            yookassaPaymentMethodLast4: null,
            yookassaPaymentMethodTitle: null,
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

      const hasNoCurrentYookassaAccess =
        existingSubscription.status === "ACTIVE" &&
        !existingSubscription.isLifetime &&
        (!existingSubscription.currentPeriodEnd ||
          existingSubscription.currentPeriodEnd <= params.now);

      if (hasNoCurrentYookassaAccess) {
        return tx.appSubscription.update({
          where: { id: existingSubscription.id },
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

      return existingSubscription;
    }

    return tx.appSubscription.create({
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
    });
  });
}

type RequestedAppSubscriptionPromoCode = { code: string; revision: number };

type AppSubscriptionCheckoutErrorCode =
  | AppSubscriptionPromoCodeDomainErrorCode
  | "SUBSCRIPTION_ALREADY_ACTIVE"
  | "SUBSCRIPTION_CHECKOUT_IN_PROGRESS"
  | "PLAN_NOT_AVAILABLE"
  | "SUBSCRIPTION_EMAIL_REQUIRED";

type PreparedInitialCheckout = {
  subscription: Awaited<ReturnType<typeof findOrCreateYookassaSetupSubscription>>;
  payment:
    | {
        id: string;
        idempotenceKey: string;
        amountRub: number;
        promoCodeSnapshot: string | null;
        promoDiscountPercent: number | null;
      }
    | null;
  reusedConfirmationUrl: string | null;
};

async function prepareInitialYookassaCheckout(params: {
  userId: string;
  planCode: AppSubscriptionPlanCode;
  originalAmountRub: number;
  currency: string;
  intervalDays: number;
  promoCode?: RequestedAppSubscriptionPromoCode;
  clientContext?: ClientAppContext;
  buyerEmail: string;
  now: Date;
}): Promise<PreparedInitialCheckout> {
  const lockKey = hashAdvisoryLockKey(`app-subscription:yookassa:start:${params.userId}`);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(${YOOKASSA_START_LOCK_NAMESPACE}, ${lockKey})`,
    );

    let promo:
      | {
          id: string;
          code: string;
          discountPercent: number;
          revision: number;
        }
      | null = null;
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
        pending.confirmationUrl &&
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
        return { subscription, payment: null, reusedConfirmationUrl: pending.confirmationUrl };
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
        throw new AppSubscriptionPromoCodeDomainError(
          "PROMO_CODE_INACTIVE",
          "Промокод выключен",
        );
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
    let subscription = existingSubscription ??
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
    const periodEnd = new Date(
      params.now.getTime() + params.intervalDays * 24 * 60 * 60 * 1000,
    );
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
        currency: params.currency,
        buyerEmail: params.buyerEmail,
        promoCodeId: promo?.id,
        promoCodeSnapshot: promo?.code,
        promoDiscountPercent: promo?.discountPercent,
        periodStart,
        periodEnd,
        idempotenceKey,
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
        promoCodeSnapshot: payment.promoCodeSnapshot,
        promoDiscountPercent: payment.promoDiscountPercent,
      },
      reusedConfirmationUrl: null,
    };
  });
}

export async function startYookassaAppSubscriptionPayment(params: {
  userId: string;
  origin: string;
  shopId: string;
  secretKey: string;
  planCode: AppSubscriptionPlanCode;
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
  const buyer = await prisma.user.findUnique({ where: { id: params.userId }, select: { email: true } });
  const buyerEmail = buyer?.email?.trim();
  if (!buyerEmail) {
    return { success: false, error: "Укажите email в профиле, чтобы получить чек", code: "SUBSCRIPTION_EMAIL_REQUIRED" };
  }
  let prepared: PreparedInitialCheckout;
  try {
    prepared = await prepareInitialYookassaCheckout({
      userId: params.userId,
      planCode,
      originalAmountRub: amountRub,
      currency,
      intervalDays,
      promoCode: params.promoCode,
      clientContext: params.clientContext,
      buyerEmail,
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
  return startInitialYookassaAppSubscriptionPayment({
    userId: params.userId,
    origin: params.origin,
    shopId: params.shopId,
    secretKey: params.secretKey,
    subscriptionId: subscription.id,
    amountRub,
    currency,
    intervalDays,
    planCode,
    now,
    preparedPayment: prepared.payment ?? undefined,
  });
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

export async function cancelYookassaAppSubscription(userId: string) {
  await prisma.appSubscription.updateMany({
    where: {
      userId,
      provider: "YOOKASSA",
      status: { in: ["ACTIVE", "PAST_DUE", "PENDING"] },
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

  const expiresDateMs = Number(payload.expiresDate ?? 0);
  const purchaseDateMs = Number(payload.purchaseDate ?? Date.now());
  const revocationDateMs = Number(payload.revocationDate ?? 0);
  const periodStart =
    Number.isFinite(purchaseDateMs) && purchaseDateMs > 0 ? new Date(purchaseDateMs) : new Date();
  const periodEnd =
    Number.isFinite(expiresDateMs) && expiresDateMs > 0
      ? new Date(expiresDateMs)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const isRevoked = Number.isFinite(revocationDateMs) && revocationDateMs > 0;
  const applePriceMilliunits = typeof payload.price === "number" ? Number(payload.price) : null;

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

  if (applePriceMilliunits === 0) {
    const existingTrialPayment = await prisma.appSubscriptionPayment.findFirst({
      where: {
        provider: "APPLE",
        appleOriginalTransactionId: originalTransactionId,
        applePriceMilliunits: 0,
        status: "SUCCEEDED",
        userId: { not: _params.userId },
      },
      select: { id: true, userId: true },
    });
    if (existingTrialPayment) {
      return {
        success: false as const,
        code: "APPLE_TRIAL_ALREADY_USED",
        error: "Пробный период Apple уже использован",
      };
    }
  }

  const existingSub = await prisma.appSubscription.findFirst({
    where: {
      userId: _params.userId,
      provider: "APPLE",
      OR: [
        { appleOriginalTransactionId: originalTransactionId },
        {
          status: { in: ["ACTIVE", "PENDING", "PAST_DUE"] },
        },
      ],
    },
    select: { id: true, userId: true },
  });

  const nextStatus = isRevoked ? "REVOKED" : periodEnd > new Date() ? "ACTIVE" : "EXPIRED";

  await prisma.$transaction(async (tx) => {
    const subscriptionId = existingSub
      ? existingSub.id
      : (
          await tx.appSubscription.create({
            data: {
              userId: _params.userId,
              provider: "APPLE",
              status: nextStatus,
              planCode: applePlan.code,
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
          planCode: applePlan.code,
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
        planCode: applePlan.code,
        amount: appleMilliunitsToAmount(applePriceMilliunits),
        currency: payload.currency ?? null,
        periodStart,
        periodEnd,
        idempotenceKey: `apple:${transactionId}`,
        appleTransactionId: transactionId,
        appleOriginalTransactionId: originalTransactionId,
        applePriceMilliunits,
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

type AppleServerSyncStatus = "ACTIVE" | "PAST_DUE" | "EXPIRED" | "REVOKED";

type AppleLastTransactionLike = {
  status?: number;
  originalTransactionId?: string;
  signedTransactionInfo?: string;
  signedRenewalInfo?: string;
};

type DecodedAppleTransactionLike = {
  type?: unknown;
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

function mapAppleServerStatus(params: {
  appleStatus: number | undefined;
  transaction: DecodedAppleTransactionLike;
  now: Date;
}): AppleServerSyncStatus {
  const revokedAt = msToDate(params.transaction.revocationDate);
  if (revokedAt || params.appleStatus === AppleSubscriptionStatus.REVOKED) return "REVOKED";
  if (params.appleStatus === AppleSubscriptionStatus.BILLING_RETRY) return "PAST_DUE";
  if (params.appleStatus === AppleSubscriptionStatus.EXPIRED) return "EXPIRED";
  if (
    params.appleStatus === AppleSubscriptionStatus.ACTIVE ||
    params.appleStatus === AppleSubscriptionStatus.BILLING_GRACE_PERIOD
  ) {
    return "ACTIVE";
  }

  const periodEnd = msToDate(params.transaction.expiresDate);
  return periodEnd && periodEnd > params.now ? "ACTIVE" : "EXPIRED";
}

function applePaymentStatus(
  status: AppleServerSyncStatus,
): "SUCCEEDED" | "CANCELED" | "FAILED" | "REFUNDED" {
  if (status === "ACTIVE") return "SUCCEEDED";
  if (status === "PAST_DUE") return "FAILED";
  if (status === "REVOKED") return "REFUNDED";
  return "CANCELED";
}

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

export async function syncAppleAppSubscriptionFromServer(params: {
  originalTransactionId: string;
  subscriptionId?: string;
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

  const subscription = await prisma.appSubscription.findFirst({
    where: params.subscriptionId
      ? {
          id: params.subscriptionId,
          provider: "APPLE",
          appleOriginalTransactionId: originalTransactionId,
        }
      : {
          provider: "APPLE",
          appleOriginalTransactionId: originalTransactionId,
        },
    select: {
      id: true,
      userId: true,
      appleProductId: true,
      planCode: true,
    },
  });
  if (!subscription) {
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
  const exactItem =
    lastTransactions.find((item) => item.originalTransactionId === originalTransactionId) ??
    lastTransactions[0];
  if (!exactItem) {
    await prisma.appSubscription.update({
      where: { id: subscription.id },
      data: { status: "EXPIRED" },
    });
    return { success: true as const, status: "EXPIRED" as const, userId: subscription.userId };
  }

  const { transaction, renewal } = await decodeAppleLastTransaction({
    verifier: verifierOrErr,
    item: exactItem,
  });
  const txOriginalTransactionId = transaction.originalTransactionId?.trim();
  if (txOriginalTransactionId && txOriginalTransactionId !== originalTransactionId) {
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
  const productId =
    transaction.productId?.trim() ?? renewal?.productId?.trim() ?? subscription.appleProductId;
  if (!transactionId || !productId) {
    return {
      success: false as const,
      code: "APPLE_VERIFY_FAILED",
      error: "Некорректный payload Apple",
    };
  }

  const periodStart = msToDate(transaction.purchaseDate) ?? new Date();
  const periodEnd = msToDate(transaction.expiresDate) ?? msToDate(renewal?.renewalDate);
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

  await prisma.$transaction(async (tx) => {
    await tx.appSubscription.update({
      where: { id: subscription.id },
      data: {
        status,
        planCode,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: renewal?.autoRenewStatus === 0,
        ...(status === "REVOKED" || status === "EXPIRED" ? { canceledAt: new Date() } : {}),
        appleOriginalTransactionId: originalTransactionId,
        appleProductId: productId,
      },
    });

    const existingPayment = await tx.appSubscriptionPayment.findUnique({
      where: { appleTransactionId: transactionId },
      select: { id: true },
    });
    if (!existingPayment) {
      await tx.appSubscriptionPayment.create({
        data: {
          subscriptionId: subscription.id,
          userId: subscription.userId,
          provider: "APPLE",
          kind: "RENEWAL",
          status: paymentStatus,
          planCode,
          amount: appleMilliunitsToAmount(priceMilliunits),
          currency,
          periodStart,
          periodEnd,
          idempotenceKey: `apple:${transactionId}`,
          appleTransactionId: transactionId,
          appleOriginalTransactionId: originalTransactionId,
          applePriceMilliunits: priceMilliunits,
          appleStorefront: transaction.storefront ?? null,
          appleEnvironment: transaction.environment ?? null,
          appleWebOrderLineItemId:
            transaction.webOrderLineItemId != null ? String(transaction.webOrderLineItemId) : null,
          succeededAt: paymentStatus === "SUCCEEDED" ? new Date() : null,
        },
      });
    }

    const syncEventIdempotencyKey = `apple-sync:${transactionId}`;
    const existingSyncEvent = await tx.appSubscriptionEvent.findUnique({
      where: { idempotencyKey: syncEventIdempotencyKey },
      select: { id: true },
    });
    if (!existingSyncEvent) {
      await tx.appSubscriptionEvent
        .create({
          data: {
            subscriptionId: subscription.id,
            userId: subscription.userId,
            source: "APPLE",
            eventType: `SERVER_SYNC:${status}`,
            idempotencyKey: syncEventIdempotencyKey,
            processingStatus: "PROCESSED",
            metadata: {
              originalTransactionId,
              transactionId,
              productId,
              appleStatus: exactItem.status ?? null,
              autoRenewStatus: renewal?.autoRenewStatus ?? null,
              expirationIntent: renewal?.expirationIntent ?? null,
              isInBillingRetryPeriod: renewal?.isInBillingRetryPeriod ?? null,
              gracePeriodExpiresDate: renewal?.gracePeriodExpiresDate ?? null,
              renewalDate: renewal?.renewalDate ?? null,
              renewalPrice: renewal?.renewalPrice ?? null,
              currency,
            },
            processedAt: new Date(),
          },
        })
        .catch((error) => {
          if (isPrismaUniqueViolation(error)) return undefined;
          throw error;
        });
    }
  });

  return { success: true as const, status, userId: subscription.userId };
}

export async function reconcileAppleAppSubscriptionsFromServer(params?: { batchSize?: number }) {
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
    return {
      success: false as const,
      code: "APPLE_RESTORE_INPUT_REQUIRED",
      error: "Требуется originalTransactionId или signedTransactionInfo",
    };
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
    return {
      success: false as const,
      code: "APPLE_RESTORE_NOT_FOUND",
      error: "Подписка не найдена",
    };
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
  const providerEventKey = params.providerEventKey ??
    `${params.event}:${params.event === "refund.succeeded" ? params.yookassaRefundId ?? params.yookassaPaymentId : params.yookassaPaymentId}`;
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
      where: subscriptionId ? { id: subscriptionId } : { yookassaPaymentMethodId: paymentMethodId },
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
        id: true, userId: true, subscriptionId: true, status: true, amount: true, currency: true,
        periodEnd: true, yookassaPaymentId: true,
      },
    });
    // A verified non-Premium payment is deliberately left to the legacy
    // webhook branch. This is not a decision based on the incoming payload.
    if (!payment) return { userId: null };
    assertYookassaPaymentConfirmed({ providerPayment, localPayment: payment, yookassaPaymentId: refund.payment_id });
    const fullRefund = amountsEqual(refund.amount?.value, payment.amount) && refund.amount?.currency === payment.currency;
    if (!fullRefund) {
      logger.warn("Partial app-subscription refund does not cancel NPD receipt", {
        refundId, paymentId: payment.id, amount: refund.amount?.value,
      });
      await prisma.npdReceipt.updateMany({
        where: { paymentId: payment.id, status: { notIn: ["CANCELED", "CANCEL_PENDING"] } },
        data: {
          status: "RECONCILIATION_REQUIRED",
          cancellationReason: "Частичный возврат: требуется проверка чека НПД",
        },
      });
      if (eventId) {
        await prisma.appSubscriptionEvent.update({
          where: { id: eventId },
          data: { processingStatus: "PROCESSED", processedAt: new Date(), userId: payment.userId, lastProcessingError: "PARTIAL_REFUND_NOT_FISCALIZED" },
        }).catch(() => undefined);
      }
      return { userId: payment.userId };
    }
    await prisma.$transaction(async (tx) => {
      await tx.appSubscriptionPayment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
      await reversePartnerCommissionForRefund(tx, payment);
      await queueNpdReceiptCancellation(tx, payment.id);
      if (payment.subscriptionId && payment.periodEnd) {
        const newerPaid = await tx.appSubscriptionPayment.findFirst({
          where: { subscriptionId: payment.subscriptionId, status: "SUCCEEDED", periodEnd: { gt: payment.periodEnd } },
          select: { id: true },
        });
        if (!newerPaid) {
          await tx.appSubscription.updateMany({
            where: { id: payment.subscriptionId, currentPeriodEnd: { lte: payment.periodEnd } },
            data: { status: "CANCELED", yookassaPaymentMethodId: null, yookassaPaymentMethodLast4: null, yookassaPaymentMethodTitle: null },
          });
        }
      }
    });
    if (eventId) {
      await prisma.appSubscriptionEvent.update({
        where: { id: eventId },
        data: { processingStatus: "PROCESSED", processedAt: new Date(), userId: payment.userId },
      }).catch(() => undefined);
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
      planCode: true,
      amount: true,
      currency: true,
      periodStart: true,
      periodEnd: true,
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
  if (payment.status === "SUCCEEDED" || payment.status === "REFUNDED") {
    if (eventId) {
      await prisma.appSubscriptionEvent
        .update({
          where: { id: eventId },
          data: { processingStatus: "PROCESSED", processedAt: new Date(), userId: payment.userId },
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
      const providerPaymentMethodId = providerPayment.payment_method?.id ?? params.paymentMethodId;
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
          periodStart.getTime() + fallbackPlan.intervalDays * 24 * 60 * 60 * 1000,
        );
      }

      await prisma.$transaction(async (tx) => {
        const claimed = await tx.appSubscriptionPayment.updateMany({
          where: { id: payment.id, status: { notIn: ["SUCCEEDED", "REFUNDED"] } },
          data: {
            status: "SUCCEEDED",
            planCode: payment.planCode,
            yookassaPaymentId: params.yookassaPaymentId,
            // The amount is an immutable local checkout snapshot. Provider amount was
            // verified against it above and must never replace/recalculate the snapshot.
            currency: payment.currency ?? providerPayment.amount?.currency ?? "RUB",
            periodStart,
            periodEnd,
            succeededAt: now,
          },
        });
        if (claimed.count !== 1) return;

        if (payment.subscriptionId) {
          await tx.appSubscription.update({
            where: { id: payment.subscriptionId },
            data: {
              status: "ACTIVE",
              planCode: payment.planCode,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              pendingExpiresAt: null,
              renewalReminderSentForPeriodEnd: null,
            },
          });
          // A late payment must not undo a cancellation made while it was in flight.
          await tx.appSubscription.updateMany({
            where: { id: payment.subscriptionId, cancelAtPeriodEnd: false },
            data: {
              ...(providerPaymentMethodId ? { yookassaPaymentMethodId: providerPaymentMethodId } : {}),
              ...(providerPaymentMethodLast4 ? { yookassaPaymentMethodLast4: providerPaymentMethodLast4 } : {}),
              ...(providerPaymentMethodTitle ? { yookassaPaymentMethodTitle: providerPaymentMethodTitle } : {}),
            },
          });
        } else {
          const created = await tx.appSubscription.create({
            data: {
              userId: payment.userId,
              provider: "YOOKASSA",
              status: "ACTIVE",
              planCode: payment.planCode,
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
        await recordPartnerCommissionForPayment(tx, payment);
        await ensureNpdReceiptForSucceededPayment(tx, payment.id);
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
    }

    if (eventId) {
      await prisma.appSubscriptionEvent
        .update({
          where: { id: eventId },
          data: { processingStatus: "PROCESSED", processedAt: new Date(), userId: payment.userId },
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

export async function handleAppleAppSubscriptionNotification(params: { signedPayload: string }) {
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
      if (previous?.processingStatus === "PROCESSED" || previous?.processingStatus === "PROCESSING") {
        return { success: true as const, duplicate: true };
      }
    }
    const claimed = await prisma.appSubscriptionEvent.updateMany({
      where: {
        providerEventKey: notificationUUID,
        processingStatus: { in: ["RECEIVED", "FAILED"] },
      },
      data: { processingStatus: "PROCESSING", processingAttempts: { increment: 1 }, lastProcessingError: null },
    });
    if (claimed.count !== 1) return { success: true as const, duplicate: true };
  }

  const markProcessed = async () => {
    if (notificationUUID) await prisma.appSubscriptionEvent.update({
      where: { providerEventKey: notificationUUID },
      data: { processingStatus: "PROCESSED", processedAt: new Date(), lastProcessingError: null },
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
    signedTransactionWasRevoked = Number((tx as { revocationDate?: unknown }).revocationDate ?? 0) > 0;
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
        const synced = await syncAppleAppSubscriptionFromServer({ originalTransactionId });
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
    if (notificationUUID) await prisma.appSubscriptionEvent.update({
      where: { providerEventKey: notificationUUID },
      data: {
        processingStatus: "FAILED",
        lastProcessingError: error instanceof Error ? error.message.slice(0, 512) : "Apple notification failed",
      },
    }).catch(() => undefined);
    throw error;
  }
}
