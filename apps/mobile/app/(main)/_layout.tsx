import { Stack } from "expo-router";
import { useTheme } from "react-native-paper";

/**
 * Layout для основного приложения (после авторизации)
 */
export default function MainLayout() {
  const theme = useTheme();

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
        name="reminders"
        options={{
          headerShown: true,
          title: "Напоминания",
        }}
      />
    </Stack>
  );
}
