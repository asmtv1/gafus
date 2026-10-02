import { Alert } from "react-native";

import { openAppSubscriptionPaywall } from "@/features/app-subscription";

export function openConsultationAccessPaywall(): void {
  openAppSubscriptionPaywall({
    reason: "required",
    contentMode: "subscription",
  });
}

/** Shown after server-side verification as the 14-day plan may still browse slots. */
export function showConsultationBookingNotIncludedAlert(): void {
  Alert.alert(
    "Запись к кинологу недоступна",
    "Запись к кинологу доступна по действующему трёхмесячному тарифу.",
    [
      { text: "Понятно", style: "cancel" },
      { text: "Выбрать тариф", onPress: openConsultationAccessPaywall },
    ],
  );
}
