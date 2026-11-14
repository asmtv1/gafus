/** Public registration/consent contract shared by API, Core and persistence. */
export type ConsentDocumentType =
  | "PERSONAL_DATA"
  | "PRIVACY_POLICY"
  | "DATA_DISTRIBUTION";

export interface ConsentPayload {
  acceptPersonalData: boolean;
  acceptPrivacyPolicy: boolean;
  acceptDataDistribution: boolean;
}

export interface CreateConsentLogsParams {
  tempSessionId: string;
  /** Committed atomically together with an account; never relink later. */
  userId?: string;
  consentPayload: ConsentPayload;
  formData: { name: string; phone?: string; email?: string };
  ipAddress?: string;
  userAgent?: string;
  /** Defaults to defaultVersion when not explicitly specified per document. */
  consentVersions?: Partial<Record<ConsentDocumentType, string>>;
  defaultVersion: string;
}
