import { openAppSubscriptionPaywall } from "@/features/app-subscription";

export function openConsultationAccessPaywall(): void {
  openAppSubscriptionPaywall({
    reason: "required",
    contentMode: "subscription",
  });
}
