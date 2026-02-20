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

export async function createConsentLogs(params: CreateConsentLogsParams): Promise<void> {
  const now = new Date();
  const records = CONSENT_TYPE_MAP.filter(({ accepted }) =>
    accepted(params.consentPayload),
  ).map(({ type, url }) => ({
    tempSessionId: params.tempSessionId,
    consentType: type,
    consentVersion:
      params.consentVersions?.[type] ?? params.defaultVersion,
    consentText: { url } as Prisma.InputJsonValue,
    consentDate: now,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent?.slice(0, 500),
    formData: params.formData as unknown as Prisma.InputJsonValue,
    status: ConsentLogStatus.PENDING,
  }));

  try {
    await prisma.$transaction(
      records.map((data) => prisma.consentLog.create({ data })),
    );
  } catch (error) {
    logger.error("createConsentLogs failed", error as Error, {
      tempSessionId: params.tempSessionId,
    });
    throw error;
  }
}

export async function linkConsentLogsToUser(
  tempSessionId: string,
  userId: string,
): Promise<void> {
  try {
    await prisma.consentLog.updateMany({
      where: { tempSessionId },
      data: { userId, status: ConsentLogStatus.COMPLETED },
    });
  } catch (error) {
    logger.error("linkConsentLogsToUser failed", error as Error, {
      tempSessionId,
      userId,
    });
    throw error;
  }
}

export async function markConsentLogsFailed(tempSessionId: string): Promise<void> {
  try {
    await prisma.consentLog.updateMany({
      where: { tempSessionId },
      data: { status: ConsentLogStatus.FAILED },
    });
  } catch (error) {
    logger.error("markConsentLogsFailed failed", error as Error, {
      tempSessionId,
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
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
