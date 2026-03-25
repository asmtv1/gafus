import { Redirect, Stack } from "expo-router";
import { useTheme } from "react-native-paper";

import { useAuthStore } from "@/shared/stores";

/**
 * Layout для основного приложения (после авторизации).
 * Редиректит неавторизованных пользователей в auth; (main) layout размонтируется, циклов нет.
 */
export default function MainLayout() {
  const theme = useTheme();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) return <Redirect href="/welcome" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerTintColor: theme.colors.onSurface,
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
        name="profile/change-phone"
        options={{
          headerShown: true,
          title: "Смена телефона",
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
