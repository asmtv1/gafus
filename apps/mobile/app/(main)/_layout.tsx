import { Redirect, Stack } from "expo-router";

import { COLORS } from "@/constants";
import { useAuthStore } from "@/shared/stores";

/**
 * Layout для основного приложения (после авторизации).
 * Редиректит неавторизованных пользователей в auth; (main) layout размонтируется, циклов нет.
 */
export default function MainLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) return <Redirect href="/welcome" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
        headerStyle: {
          backgroundColor: COLORS.background,
        },
        headerTintColor: COLORS.text,
        headerShadowVisible: false,
        headerBackTitle: "Назад",
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="training/[courseType]/index"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="training/[courseType]/[dayId]"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="trainings/[courseType]/index"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="trainings/[courseType]/[day]"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="trainings/[courseType]/reviews"
        options={{ headerShown: false }}
      />
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
          headerShown: true,
          title: "Напоминания",
        }}
      />
      <Stack.Screen
        name="articles/[slug]"
        options={{ headerShown: false }}
      />
    </Stack>
  );
}
