import type { ConsentType } from "@gafus/prisma";

export interface ConsentPayload {
  acceptPersonalData: boolean;
  acceptPrivacyPolicy: boolean;
  acceptDataDistribution: boolean;
}

export interface CreateConsentLogsParams {
  tempSessionId: string;
  /** Set by an atomic registration transaction; transports must not link these later. */
  userId?: string;
  consentPayload: ConsentPayload;
  /** Данные формы для аудита: телефон и/или email (после регистрации по email phone может отсутствовать). */
  formData: { name: string; phone?: string; email?: string };
  ipAddress?: string;
  userAgent?: string;
  /** Per-document versions; falls back to provided defaultVersion */
  consentVersions?: Partial<Record<ConsentType, string>>;
  defaultVersion: string;
}
