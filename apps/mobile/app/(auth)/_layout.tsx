import { Redirect, Stack, usePathname } from "expo-router";
import { useShallow } from "zustand/react/shallow";

import { useAuthStore } from "@/shared/stores";

/**
 * Layout группы авторизации.
 * Редиректит авторизованных пользователей в main,
 * а пользователей с pending-состоянием — на нужный экран.
 * Использует <Redirect> (fires once on mount) — не вызывает циклов.
 */
export default function AuthLayout() {
  const { isAuthenticated, pendingVkPhone, pendingVkConsent } = useAuthStore(
    useShallow((s) => ({
      isAuthenticated: s.isAuthenticated,
      pendingVkPhone: s.pendingVkPhone,
      pendingVkConsent: s.pendingVkConsent,
    })),
  );
  const pathname = usePathname();

  // Полностью авторизован → переходим в main; (auth) layout размонтируется, циклов нет
  // Презентацию можно открыть вручную из профиля уже авторизованному пользователю.
  // Для остальных auth-маршрутов сохраняем обычный редирект в приложение.
  if (isAuthenticated && !pendingVkPhone && !pendingVkConsent && pathname !== "/intro") {
    return <Redirect href="/(main)/(tabs)" />;
  }

  // Pending-состояния: редирект только если пользователь не на нужном экране
  if (pendingVkConsent && pathname !== "/vk-consent") return <Redirect href="/vk-consent" />;
  if (pendingVkPhone && pathname !== "/vk-set-phone") return <Redirect href="/vk-set-phone" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="intro" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="vk-set-phone" />
      <Stack.Screen name="vk-consent" />
    </Stack>
  );
}
