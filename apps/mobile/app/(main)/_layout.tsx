import { useEffect } from "react";
import { ChatOverlayRoot } from "@/features/cynologist-chat/ChatOverlayRoot";
import { Redirect, Stack } from "expo-router";

import { COLORS } from "@/shared/config";
import { PaperTextureBackground } from "@/shared/components";
import { useAuthStore } from "@/shared/stores";
import { MobileOnboardingTourProvider } from "@/features/onboarding-tour";
import {
  AppSubscriptionProvider,
  flushDeferredAppSubscriptionPaywall,
  usePaywallStore,
} from "@/features/app-subscription";
import { useMobileOnboardingTourStore } from "@/features/onboarding-tour";

function AppSubscriptionOnboardingCoordinator() {
  const hasHydrated = useMobileOnboardingTourStore((s) => s.hasHydrated);
  const hasLoadedStatus = useMobileOnboardingTourStore((s) => s.hasLoadedStatus);
  const hasSeenV1 = useMobileOnboardingTourStore((s) => s.hasSeenV1);
  const isActive = useMobileOnboardingTourStore((s) => s.isActive);
  const isAwaitingRequiredPetCreation = useMobileOnboardingTourStore(
    (s) => s.isAwaitingRequiredPetCreation,
  );
  const pendingReason = usePaywallStore((s) => s.pendingReason);

  useEffect(() => {
    if (
      !pendingReason ||
      !hasHydrated ||
      !hasLoadedStatus ||
      !hasSeenV1 ||
      isActive ||
      isAwaitingRequiredPetCreation
    ) {
      return;
    }
    flushDeferredAppSubscriptionPaywall();
  }, [
    hasHydrated,
    hasLoadedStatus,
    hasSeenV1,
    isActive,
    isAwaitingRequiredPetCreation,
    pendingReason,
  ]);

  return null;
}

/**
 * Layout для основного приложения (после авторизации).
 * Редиректит неавторизованных пользователей в auth; (main) layout размонтируется, циклов нет.
 */
export default function MainLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) return <Redirect href="/welcome" />;

  return (
    <ChatOverlayRoot>
      <MobileOnboardingTourProvider>
        <AppSubscriptionProvider>
          <AppSubscriptionOnboardingCoordinator />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: COLORS.background },
              headerStyle: {
                backgroundColor: COLORS.background,
              },
              headerBackground: () => <PaperTextureBackground />,
              headerTintColor: COLORS.text,
              headerShadowVisible: false,
              headerBackTitle: "Назад",
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="partner"
              options={{ headerShown: true, title: "Партнёрская программа" }}
            />
            <Stack.Screen name="training/[courseType]/index" options={{ headerShown: false }} />
            <Stack.Screen name="training/[courseType]/[dayId]" options={{ headerShown: false }} />
            <Stack.Screen name="daily-course/[scheduleId]" options={{ headerShown: false }} />
            <Stack.Screen name="trainings/[courseType]/index" options={{ headerShown: false }} />
            <Stack.Screen name="trainings/[courseType]/[day]" options={{ headerShown: false }} />
            <Stack.Screen name="trainings/[courseType]/reviews" options={{ headerShown: false }} />
            <Stack.Screen
              name="pets/add"
              options={{
                headerShown: true,
                title: "Добавить питомца",
              }}
            />
            <Stack.Screen
              name="pets/edit/[id]"
              options={{
                headerShown: true,
                title: "Редактировать питомца",
              }}
            />
            <Stack.Screen
              name="profile/edit"
              options={{
                headerShown: true,
                title: "Редактировать профиль",
              }}
            />
            <Stack.Screen
              name="profile/change-email"
              options={{
                headerShown: true,
                title: "Смена email",
              }}
            />
            <Stack.Screen
              name="profile/change-username"
              options={{
                headerShown: true,
                title: "Смена логина",
              }}
            />
            <Stack.Screen
              name="profile/change-password"
              options={{
                headerShown: true,
                title: "Смена пароля",
              }}
            />
            <Stack.Screen
              name="profile/set-password"
              options={{
                headerShown: true,
                title: "Установка пароля",
              }}
            />
            <Stack.Screen
              name="profile/delete-account"
              options={{
                headerShown: true,
                title: "Удаление аккаунта",
              }}
            />
            <Stack.Screen
              name="reminders"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="consultations/index"
              options={{
                headerShown: true,
                title: "Консультации",
              }}
            />
            <Stack.Screen
              name="consultations/[userId]"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="consultations/mine"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="consultations/booking-confirm"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen name="articles/[slug]" options={{ headerShown: false }} />
          </Stack>
        </AppSubscriptionProvider>
      </MobileOnboardingTourProvider>
    </ChatOverlayRoot>
  );
}
