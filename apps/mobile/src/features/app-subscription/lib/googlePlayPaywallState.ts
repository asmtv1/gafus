import type { AppSubscriptionStatusDto } from "../api/appSubscriptionApi";

type PaymentStatus = Pick<AppSubscriptionStatusDto, "status" | "provider"> | null | undefined;

export function isGooglePlayPaymentPending(status: PaymentStatus, localPending: boolean) {
  return localPending || (status?.status === "PENDING" && status.provider === "GOOGLE_PLAY");
}

export function isOtherProviderPaymentPending(status: PaymentStatus) {
  return status?.status === "PENDING" && status.provider !== "GOOGLE_PLAY";
}
