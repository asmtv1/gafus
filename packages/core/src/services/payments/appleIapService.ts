import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  Environment as AppleEnvironment,
  SignedDataVerifier,
  VerificationException,
} from "@apple/app-store-server-library";
import { isPrismaUniqueConstraintError, prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import { recordOfertaAcceptance } from "../oferta/ofertaAcceptanceService";
import { getAppleIapTarget } from "./appleIapProductMap";
import type { AppleIapVerifyResult, VerifyAndGrantAppleIapParams } from "./appleIapTypes";
import {
  grantArticleAccessInTransaction,
  grantCourseAccessInTransaction,
} from "./grantAccessAfterPurchase";

const logger = createWebLogger("apple-iap-service");

/** Публичные корни Apple (DER), см. apple-certs/README.md */
const ROOT_CERT_FILES = [
  "AppleRootCA-G3.cer",
  "AppleRootCA-G2.cer",
  "AppleIncRootCertificate.cer",
] as const;

function getAppleCertsDir(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "apple-certs");
}

function loadRootCertificates(): Buffer[] {
  const dir = getAppleCertsDir();
  return ROOT_CERT_FILES.map((name) => readFileSync(path.join(dir, name)));
}

function parseAppleVerifierEnvironment(): AppleEnvironment {
  const raw = process.env.APPLE_ENVIRONMENT?.trim().toUpperCase();
  if (raw === "PRODUCTION") {
    return AppleEnvironment.PRODUCTION;
  }
  return AppleEnvironment.SANDBOX;
}

let verifierSingleton: SignedDataVerifier | null = null;
let verifierConfigKey = "";

function getSignedDataVerifier(): SignedDataVerifier | null {
  const bundleId = process.env.APPLE_BUNDLE_ID?.trim();
  if (!bundleId) {
    return null;
  }
  const appleEnv = parseAppleVerifierEnvironment();
  const appAppleIdRaw = process.env.APPLE_APP_APPLE_ID?.trim();
  let appAppleId: number | undefined;
  if (appleEnv === AppleEnvironment.PRODUCTION) {
    const n = Number.parseInt(appAppleIdRaw ?? "", 10);
    if (appAppleIdRaw === undefined || appAppleIdRaw === "" || Number.isNaN(n)) {
      return null;
    }
    appAppleId = n;
  }
  const key = `${bundleId}|${appleEnv}|${appAppleId ?? ""}`;
  if (verifierSingleton && verifierConfigKey === key) {
    return verifierSingleton;
  }
  try {
    const certs = loadRootCertificates();
    verifierSingleton = new SignedDataVerifier(
      certs,
      true,
      appleEnv,
      bundleId,
      appAppleId,
    );
    verifierConfigKey = key;
    return verifierSingleton;
  } catch (error) {
    logger.error(
      "Не удалось инициализировать SignedDataVerifier",
      error instanceof Error ? error : new Error(String(error)),
    );
    return null;
  }
}

function jwsPayloadHashHex(jws: string): string {
  return createHash("sha256").update(jws, "utf8").digest("hex");
}

function toDbEnvironment(decodedEnv: string | undefined): "SANDBOX" | "PRODUCTION" {
  if (
    decodedEnv === AppleEnvironment.SANDBOX ||
    decodedEnv === AppleEnvironment.XCODE ||
    decodedEnv === AppleEnvironment.LOCAL_TESTING
  ) {
    return "SANDBOX";
  }
  return "PRODUCTION";
}

export async function verifyAndGrantAppleIap(
  params: VerifyAndGrantAppleIapParams,
): Promise<AppleIapVerifyResult> {
  const verifier = getSignedDataVerifier();
  if (!verifier) {
    return {
      success: false,
      error: "Сервер не настроен для Apple IAP",
      code: "CONFIG_APPLE_IAP",
    };
  }

  let decoded;
  try {
    decoded = await verifier.verifyAndDecodeTransaction(params.transactionJws);
  } catch (error) {
    if (error instanceof VerificationException) {
      logger.warn("JWS Apple IAP не прошёл проверку", {
        userId: params.userId,
        status: error.status,
      });
    } else {
      logger.error(
        "Ошибка верификации JWS Apple IAP",
        error instanceof Error ? error : new Error(String(error)),
        { userId: params.userId },
      );
    }
    return {
      success: false,
      error: "Ошибка верификации покупки",
      code: "JWS_INVALID",
    };
  }

  const bundleId = process.env.APPLE_BUNDLE_ID?.trim();
  if (!decoded.bundleId || !bundleId || decoded.bundleId !== bundleId) {
    return {
      success: false,
      error: "Ошибка верификации покупки",
      code: "JWS_INVALID",
    };
  }

  const productId = decoded.productId;
  if (!productId) {
    return {
      success: false,
      error: "Ошибка верификации покупки",
      code: "JWS_INVALID",
    };
  }

  const target = getAppleIapTarget(productId);
  if (!target) {
    return {
      success: false,
      error: "Неизвестный продукт",
      code: "UNKNOWN_PRODUCT",
    };
  }

  const originalTransactionId = decoded.originalTransactionId;
  const transactionId = decoded.transactionId;
  if (!originalTransactionId || !transactionId) {
    return {
      success: false,
      error: "Ошибка верификации покупки",
      code: "JWS_INVALID",
    };
  }

  if (target.kind === "course") {
    const course = await prisma.course.findUnique({
      where: { id: target.courseId },
      select: { id: true, isPaid: true },
    });
    if (!course || !course.isPaid) {
      return {
        success: false,
        error: "Курс не найден или недоступен для покупки",
        code: "NOT_FOUND",
      };
    }
  } else {
    const article = await prisma.article.findUnique({
      where: { id: target.articleId },
      select: { id: true, visibility: true },
    });
    if (!article || article.visibility !== "PAID") {
      return {
        success: false,
        error: "Статья не найдена или недоступна для покупки",
        code: "NOT_FOUND",
      };
    }
  }

  const existing = await prisma.appleIapTransaction.findUnique({
    where: { originalTransactionId },
    select: { id: true, userId: true },
  });

  if (existing) {
    if (existing.userId === params.userId) {
      return { success: true, alreadyGranted: true };
    }
    return {
      success: false,
      error: "Покупка привязана к другому аккаунту",
      code: "IAP_ALREADY_LINKED",
    };
  }

  const envEnum = toDbEnvironment(decoded.environment as string | undefined);

  let ledgerRowId: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      const ledger = await tx.appleIapTransaction.create({
        data: {
          userId: params.userId,
          productId,
          originalTransactionId,
          transactionId: String(transactionId),
          environment: envEnum,
          courseId: target.kind === "course" ? target.courseId : null,
          articleId: target.kind === "article" ? target.articleId : null,
          jwsPayloadHash: jwsPayloadHashHex(params.transactionJws),
        },
      });
      ledgerRowId = ledger.id;
      if (target.kind === "course") {
        await grantCourseAccessInTransaction(tx, {
          userId: params.userId,
          courseId: target.courseId,
        });
      } else {
        await grantArticleAccessInTransaction(tx, {
          userId: params.userId,
          articleId: target.articleId,
        });
      }
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      const row = await prisma.appleIapTransaction.findUnique({
        where: { originalTransactionId },
        select: { userId: true },
      });
      if (row?.userId === params.userId) {
        return { success: true, alreadyGranted: true };
      }
      if (row) {
        return {
          success: false,
          error: "Покупка привязана к другому аккаунту",
          code: "IAP_ALREADY_LINKED",
        };
      }
      return { success: true, alreadyGranted: true };
    }
    logger.error(
      "Ошибка записи Apple IAP",
      error instanceof Error ? error : new Error(String(error)),
      { userId: params.userId, originalTransactionId },
    );
    return {
      success: false,
      error: "Не удалось подтвердить покупку",
      code: "INTERNAL",
    };
  }

  logger.info("Apple IAP verified", {
    userId: params.userId,
    productId,
    originalTransactionId,
  });

  if (target.kind === "course" && ledgerRowId) {
    void recordOfertaAcceptance({
      userId: params.userId,
      courseId: target.courseId,
      paymentId: null,
      appleIapTransactionId: ledgerRowId,
      ipAddress: params.clientIp,
      userAgent: params.userAgent,
      source: "mobile",
    }).catch((err: unknown) => {
      logger.error("Ошибка записи согласия с офертой (IAP)", err as Error, {
        userId: params.userId,
        appleIapTransactionId: ledgerRowId,
      });
    });
  }

  return { success: true, alreadyGranted: false };
}
