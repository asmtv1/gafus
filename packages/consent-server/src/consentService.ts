import {
  ConsentLogStatus,
  ConsentType,
  type Prisma,
  prisma,
} from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import type { ConsentPayload, CreateConsentLogsParams } from "./types";

const logger = createWebLogger("consent-service");

const CONSENT_TYPE_MAP: {
  type: ConsentType;
  accepted: (p: ConsentPayload) => boolean;
  url: string;
}[] = [
  {
    type: ConsentType.PERSONAL_DATA,
    accepted: (p) => p.acceptPersonalData,
    url: "/personal.html",
  },
  {
    type: ConsentType.PRIVACY_POLICY,
    accepted: (p) => p.acceptPrivacyPolicy,
    url: "/policy.html",
  },
  {
    type: ConsentType.DATA_DISTRIBUTION,
    accepted: (p) => p.acceptDataDistribution,
    url: "/personal-distribution.html",
  },
];

/**
 * Writes accepted consent records through the caller's transaction. Registration
 * uses COMPLETED so a committed account can never be separated from its consents.
 */
export async function createCompletedConsentLogsInTransaction(
  tx: Prisma.TransactionClient,
  params: CreateConsentLogsParams,
): Promise<void> {
  const userId = params.userId;
  if (!userId) throw new Error("CONSENT_OWNER_REQUIRED");
  const now = new Date();
  const records = CONSENT_TYPE_MAP.filter(({ accepted }) =>
    accepted(params.consentPayload),
  ).map(({ type, url }) => ({
    tempSessionId: params.tempSessionId,
    consentType: type,
    userId,
    consentVersion:
      params.consentVersions?.[type] ?? params.defaultVersion,
    consentText: { url } as Prisma.InputJsonValue,
    consentDate: now,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent?.slice(0, 500),
    formData: params.formData as unknown as Prisma.InputJsonValue,
    status: ConsentLogStatus.COMPLETED,
  }));

  try {
    // Explicit compare-and-set. If a row is already completed or belongs to
    // someone else, the unique constraint rejects the insert; never reassign it.
    for (const data of records) {
      const updated = await tx.consentLog.updateMany({
        where: {
          tempSessionId: data.tempSessionId,
          consentType: data.consentType,
          status: { not: ConsentLogStatus.COMPLETED },
          OR: [{ userId: null }, { userId }],
        },
        data,
      });
      if (updated.count === 0) await tx.consentLog.create({ data });
    }
  } catch (error) {
    logger.error("createCompletedConsentLogsInTransaction failed", error as Error, {
      tempSessionId: params.tempSessionId,
    });
    throw error;
  }
}

function getConsentCleanupDays(): number {
  const val = process.env.CONSENT_CLEANUP_DAYS;
  if (!val) return 90;
  const parsed = parseInt(val, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 365) return 90;
  return parsed;
}

export async function deleteOldFailedConsentLogs(options?: {
  daysOld?: number;
}): Promise<{ deleted: number } | { error: string }> {
  const daysOld = options?.daysOld ?? getConsentCleanupDays();
  const cutoff = new Date(
    Date.now() - daysOld * 24 * 60 * 60 * 1000,
  );

  try {
    const result = await prisma.consentLog.deleteMany({
      where: {
        status: ConsentLogStatus.FAILED,
        userId: null,
        createdAt: { lt: cutoff },
      },
    });
    return { deleted: result.count };
  } catch (error) {
    logger.error("deleteOldFailedConsentLogs failed", error as Error, {
      daysOld,
      cutoff,
    });
    return {
      error: error instanceof Error ? error.message : "Не удалось записать согласия",
    };
  }
}
