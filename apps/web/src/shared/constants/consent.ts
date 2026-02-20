export const CONSENT_VERSION =
  process.env.CONSENT_VERSION ?? "v1.0 2026-02-13";

export type ConsentStatus = "pending" | "completed" | "failed";

export interface ConsentPayload {
  acceptPersonalData: boolean;
  acceptPrivacyPolicy: boolean;
  acceptDataDistribution: boolean;
}

export const CONSENT_DOCUMENTS = [
  {
    type: "PERSONAL_DATA" as const,
    version: CONSENT_VERSION,
    url: "/personal.html",
  },
  {
    type: "PRIVACY_POLICY" as const,
    version: CONSENT_VERSION,
    url: "/policy.html",
  },
  {
    type: "DATA_DISTRIBUTION" as const,
    version: CONSENT_VERSION,
    url: "/personal-distribution.html",
  },
] as const;
