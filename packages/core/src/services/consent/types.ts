import type { ConsentType } from "@gafus/prisma";

export interface ConsentPayload {
  acceptPersonalData: boolean;
  acceptPrivacyPolicy: boolean;
  acceptDataDistribution: boolean;
}

export interface CreateConsentLogsParams {
  tempSessionId: string;
  consentPayload: ConsentPayload;
  formData: { name: string; phone: string };
  ipAddress?: string;
  userAgent?: string;
  /** Per-document versions; falls back to provided defaultVersion */
  consentVersions?: Partial<Record<ConsentType, string>>;
  defaultVersion: string;
}
