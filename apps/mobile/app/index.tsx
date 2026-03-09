import { Redirect } from "expo-router";

import { useAuthStore } from "@/shared/stores";

/**
 * Корневой маршрут — мгновенный редирект по auth состоянию.
 * Рендерится только когда AuthProvider уже завершил checkAuth.
 */
export default function Index() {
  const { isAuthenticated, pendingConfirmPhone, pendingVkPhone, pendingVkConsent } = useAuthStore();

  if (isAuthenticated) return <Redirect href="/(main)" />;
  if (pendingVkConsent) return <Redirect href="/vk-consent" />;
  if (pendingVkPhone) return <Redirect href="/vk-set-phone" />;
  if (pendingConfirmPhone) return <Redirect href="/confirm" />;
  return <Redirect href="/welcome" />;
}
