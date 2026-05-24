import { Suspense } from "react";
import { AppSubscriptionPaywall } from "@/features/app-subscription";

export default function SubscriptionPage() {
  return (
    <Suspense fallback={null}>
      <AppSubscriptionPaywall />
    </Suspense>
  );
}
