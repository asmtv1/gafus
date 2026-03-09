import { Redirect, Stack, usePathname } from "expo-router";

import { useAuthStore } from "@/shared/stores";

/**
 * Layout группы авторизации.
 * Редиректит авторизованных пользователей в main,
 * а пользователей с pending-состоянием — на нужный экран.
 * Использует <Redirect> (fires once on mount) — не вызывает циклов.
 */
export default function AuthLayout() {
  const { isAuthenticated, pendingConfirmPhone, pendingVkPhone, pendingVkConsent } = useAuthStore();
  const pathname = usePathname();

  // Полностью авторизован → переходим в main; (auth) layout размонтируется, циклов нет
  if (isAuthenticated && !pendingConfirmPhone && !pendingVkPhone && !pendingVkConsent) {
    return <Redirect href="/(main)" />;
  }

  // Pending-состояния: редирект только если пользователь не на нужном экране
  if (pendingVkConsent && pathname !== "/vk-consent") return <Redirect href="/vk-consent" />;
  if (pendingVkPhone && pathname !== "/vk-set-phone") return <Redirect href="/vk-set-phone" />;
  if (pendingConfirmPhone && pathname !== "/confirm") return <Redirect href="/confirm" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="confirm" />
      <Stack.Screen name="vk-set-phone" />
      <Stack.Screen name="vk-consent" />
    </Stack>
  );
}
