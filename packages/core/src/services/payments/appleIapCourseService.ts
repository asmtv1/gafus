/**
 * Верификация Apple IAP (non-consumable) для платных курсов.
 */

import {
  Environment,
  SignedDataVerifier,
  Type,
} from "@apple/app-store-server-library";
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import { recordOfertaAcceptance } from "../oferta/ofertaAcceptanceService";

const logger = createWebLogger("apple-iap-course-service");

/** Максимальная сумма платежа (как в paymentService). */
const MAX_AMOUNT_RUB = 100000;

/**
 * Apple Root CA — G3 (DER), публичный сертификат с сайта Apple PKI.
 * Используется SignedDataVerifier; не является секретом.
 */
const APPLE_ROOT_CA_G3_DER_BASE64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";

export type VerifyAppleCoursePurchaseResult =
  | { success: true; courseId: string }
  | { success: false; error: string; code: string };

type VerifyAppleCoursePurchaseError = Extract<
  VerifyAppleCoursePurchaseResult,
  { success: false }
>;

export interface VerifyAppleCoursePurchaseParams {
  userId: string;
  signedTransactionInfo: string;
  acceptanceContext?: {
    ipAddress?: string | null;
    userAgent?: string | null;
    source: "mobile";
  };
}

function isPrismaUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2002"
  );
}

function parseEnvBoolean(raw: string | undefined): boolean {
  return raw === "1" || raw?.toLowerCase() === "true";
}

let verifierSingleton: SignedDataVerifier | null = null;
let verifierConfigKey: string | null = null;

type VerifierInitResult =
  | SignedDataVerifier
  | { ok: false; result: VerifyAppleCoursePurchaseError };

function getVerifier(): VerifierInitResult {
  const bundleId = process.env.APPLE_BUNDLE_ID?.trim();
  if (!bundleId) {
    return {
      ok: false,
      result: {
        success: false,
        error: "Сервер не настроен для Apple IAP",
        code: "CONFIG_APPLE_IAP",
      },
    };
  }

  const useSandbox = parseEnvBoolean(process.env.APPLE_USE_SANDBOX);
  const environment = useSandbox ? Environment.SANDBOX : Environment.PRODUCTION;

  let appAppleId: number | undefined;
  const appIdRaw = process.env.APPLE_APP_ID?.trim();
  if (appIdRaw) {
    const n = Number.parseInt(appIdRaw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      return {
        ok: false,
        result: {
          success: false,
          error: "Некорректный APPLE_APP_ID",
          code: "CONFIG_APPLE_IAP",
        },
      };
    }
    appAppleId = n;
  } else if (environment === Environment.PRODUCTION) {
    return {
      ok: false,
      result: {
        success: false,
        error: "Для production требуется APPLE_APP_ID",
        code: "CONFIG_APPLE_IAP",
      },
    };
  }

  const configKey = `${bundleId}|${environment}|${appAppleId ?? ""}`;
  if (verifierSingleton && verifierConfigKey === configKey) {
    return verifierSingleton;
  }

  const appleRootCAs = [Buffer.from(APPLE_ROOT_CA_G3_DER_BASE64, "base64")];
  verifierSingleton = new SignedDataVerifier(
    appleRootCAs,
    true,
    environment,
    bundleId,
    appAppleId,
  );
  verifierConfigKey = configKey;
  return verifierSingleton;
}

function isNonConsumableType(type: unknown): boolean {
  return type === Type.NON_CONSUMABLE || type === "Non-Consumable";
}

/**
 * Проверяет JWS транзакции StoreKit 2, выдаёт доступ к курсу и создаёт Payment (идемпотентно).
 */
export async function verifyAppleCoursePurchase(
  params: VerifyAppleCoursePurchaseParams,
): Promise<VerifyAppleCoursePurchaseResult> {
  const { userId, signedTransactionInfo, acceptanceContext } = params;

  const verifierOrErr = getVerifier();
  if (!(verifierOrErr instanceof SignedDataVerifier)) {
    logger.warn("Apple IAP: конфигурация", { code: verifierOrErr.result.code });
    return verifierOrErr.result;
  }
  const verifier = verifierOrErr;

  let transactionId: string;
  let productId: string;
  try {
    const payload = await verifier.verifyAndDecodeTransaction(signedTransactionInfo);
    if (!isNonConsumableType(payload.type)) {
      return {
        success: false,
        error: "Недопустимый тип покупки в App Store",
        code: "APPLE_INVALID_PRODUCT_TYPE",
      };
    }
    const tid = payload.transactionId?.trim();
    const pid = payload.productId?.trim();
    if (!tid || !pid) {
      return {
        success: false,
        error: "Не удалось проверить транзакцию Apple",
        code: "APPLE_VERIFY_FAILED",
      };
    }
    transactionId = tid;
    productId = pid;
  } catch {
    logger.warn("Apple IAP: verify failed", { code: "APPLE_VERIFY_FAILED" });
    return {
      success: false,
      error: "Не удалось проверить транзакцию Apple",
      code: "APPLE_VERIFY_FAILED",
    };
  }

  const course = await prisma.course.findUnique({
    where: { appleIapProductId: productId },
    select: {
      id: true,
      isPaid: true,
      priceRub: true,
      appleIapProductId: true,
    },
  });

  if (
    !course ||
    !course.isPaid ||
    course.appleIapProductId == null ||
    course.appleIapProductId !== productId
  ) {
    return {
      success: false,
      error: "Продукт не найден или курс не является платным",
      code: "APPLE_PRODUCT_UNKNOWN",
    };
  }

  const amountRub = course.priceRub != null ? Number(course.priceRub) : null;
  if (amountRub == null || amountRub < 0.01 || amountRub > MAX_AMOUNT_RUB) {
    return {
      success: false,
      error: "Продукт не найден или курс не является платным",
      code: "APPLE_PRODUCT_UNKNOWN",
    };
  }

  const courseId = course.id;

  const existingByAppleTx = await prisma.payment.findUnique({
    where: { appleTransactionId: transactionId },
    select: { id: true, userId: true, courseId: true },
  });

  if (existingByAppleTx) {
    if (existingByAppleTx.userId !== userId || existingByAppleTx.courseId !== courseId) {
      return {
        success: false,
        error: "Транзакция уже привязана к другому аккаунту",
        code: "APPLE_TRANSACTION_CONFLICT",
      };
    }
    await prisma.courseAccess.upsert({
      where: { courseId_userId: { courseId, userId } },
      create: { courseId, userId },
      update: {},
    });
    logger.info("Apple IAP: идемпотентный успех", { courseId, transactionId });
    return { success: true, courseId };
  }

  const existingAccess = await prisma.courseAccess.findUnique({
    where: { courseId_userId: { courseId, userId } },
  });
  if (existingAccess) {
    logger.info("Apple IAP: доступ уже есть", { courseId, userId });
    return { success: true, courseId };
  }

  try {
    const newPayment = await prisma.$transaction(async (tx) => {
      await tx.courseAccess.upsert({
        where: { courseId_userId: { courseId, userId } },
        create: { courseId, userId },
        update: {},
      });
      return tx.payment.create({
        data: {
          userId,
          courseId,
          amountRub,
          currency: "RUB",
          provider: "APPLE",
          appleTransactionId: transactionId,
          status: "SUCCEEDED",
          yookassaPaymentId: null,
          confirmationUrl: null,
        },
        select: { id: true },
      });
    });

    if (acceptanceContext) {
      recordOfertaAcceptance({
        userId,
        courseId,
        paymentId: newPayment.id,
        ipAddress: acceptanceContext.ipAddress,
        userAgent: acceptanceContext.userAgent,
        source: acceptanceContext.source,
      }).catch((err: unknown) => {
        logger.error("Ошибка записи согласия с офертой (Apple IAP)", err as Error, {
          paymentId: newPayment.id,
        });
      });
    }

    logger.info("Apple IAP: покупка подтверждена", { courseId, transactionId });
    return { success: true, courseId };
  } catch (e) {
    if (isPrismaUniqueViolation(e)) {
      const again = await prisma.payment.findUnique({
        where: { appleTransactionId: transactionId },
        select: { userId: true, courseId: true },
      });
      if (again && again.userId === userId && again.courseId === courseId) {
        await prisma.courseAccess.upsert({
          where: { courseId_userId: { courseId, userId } },
          create: { courseId, userId },
          update: {},
        });
        return { success: true, courseId };
      }
      if (again) {
        return {
          success: false,
          error: "Транзакция уже привязана к другому аккаунту",
          code: "APPLE_TRANSACTION_CONFLICT",
        };
      }
    }
    logger.error("Apple IAP: ошибка транзакции БД", e as Error, { courseId });
    return {
      success: false,
      error: "Не удалось завершить покупку",
      code: "PAYMENT_ERROR",
    };
  }
}
