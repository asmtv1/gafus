import { Redirect } from "expo-router";
import { useShallow } from "zustand/react/shallow";

import { useAuthStore } from "@/shared/stores";

/**
 * Корневой маршрут — мгновенный редирект по auth состоянию.
 * Рендерится только когда AuthProvider уже завершил checkAuth.
 */
export default function Index() {
  const { isAuthenticated, pendingVkPhone, pendingVkConsent } = useAuthStore(
    useShallow((s) => ({
      isAuthenticated: s.isAuthenticated,
      pendingVkPhone: s.pendingVkPhone,
      pendingVkConsent: s.pendingVkConsent,
    })),
  );

  if (isAuthenticated) return <Redirect href="/(main)" />;
  if (pendingVkConsent) return <Redirect href="/vk-consent" />;
  if (pendingVkPhone) return <Redirect href="/vk-set-phone" />;
  return <Redirect href="/welcome" />;
}
