import AppSubscriptionsClient from "./AppSubscriptionsClient";

import { getAdminAppSubscriptionDashboard } from "@/features/app-subscriptions/lib/getAppSubscriptionDashboard";

export default async function AppSubscriptionsPage() {
  const dashboard = await getAdminAppSubscriptionDashboard();

  return <AppSubscriptionsClient dashboard={dashboard} />;
}
