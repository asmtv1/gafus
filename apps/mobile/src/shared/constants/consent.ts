import { WEB_BASE } from "@/shared/lib/utils/alerts";

export interface ConsentPayload {
  acceptPersonalData: boolean;
  acceptPrivacyPolicy: boolean;
  acceptDataDistribution: boolean;
}

export const CONSENT_DOCUMENT_URLS = {
  personal: `${WEB_BASE}/personal.html`,
  policy: `${WEB_BASE}/policy.html`,
  dataDistribution: `${WEB_BASE}/personal-distribution.html`,
} as const;
