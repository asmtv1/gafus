import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { COLORS } from "@/constants";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

/** Цвет неактивного таба (иконка и подпись) */
const TAB_INACTIVE = "#6A6A6A";
/** Фон нижней панели табов */
const TAB_BAR_BG = "#F5F0E8";

/**
 * Layout нижней навигации — цвета из дизайна приложения, не зависят от темы.
 */
export default function TabsLayout() {
  const renderIcon = (name: IconName, color: string, size: number) => (
    <MaterialCommunityIcons name={name} size={size} color={color} />
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: TAB_INACTIVE,
        tabBarStyle: {
          backgroundColor: TAB_BAR_BG,
          borderTopWidth: 1,
          borderTopColor: COLORS.borderLight,
        },
        headerStyle: {
          backgroundColor: COLORS.surface,
        },
        headerTintColor: COLORS.text,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Курсы",
          tabBarIcon: ({ color, size }) => renderIcon("book-open-variant", color, size),
        }}
      />
      <Tabs.Screen
        name="courses"
        options={{
          title: "Избранное",
          tabBarIcon: ({ color, size }) => renderIcon("heart", color, size),
        }}
      />
      <Tabs.Screen
        name="achievements"
        options={{
          title: "Достижения",
          tabBarIcon: ({ color, size }) => renderIcon("trophy", color, size),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Профиль",
          tabBarIcon: ({ color, size }) => renderIcon("account", color, size),
        }}
      />
    </Tabs>
  );
}
