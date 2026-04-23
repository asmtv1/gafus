import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { COLORS } from "@/constants";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
const TAB_ICON_SIZE = 30;

/** Цвет неактивного таба (иконка и подпись) */
const TAB_INACTIVE = "#6A6A6A";
/** Фон нижней панели табов */
const TAB_BAR_BG = "#F5F0E8";

/**
 * Layout нижней навигации — цвета из дизайна приложения, не зависят от темы.
 */
export default function TabsLayout() {
  const renderIcon = (name: IconName, color: string) => (
    <MaterialCommunityIcons name={name} size={TAB_ICON_SIZE} color={color} />
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: TAB_INACTIVE,
        tabBarAllowFontScaling: false,
        tabBarLabelStyle: {
          fontSize: 11,
        },
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
        name="courses"
        options={{
          title: "Избранное",
          tabBarIcon: ({ color }) => renderIcon("heart", color),
        }}
      />
      <Tabs.Screen
        name="articles"
        options={{
          title: "Статьи",
          tabBarIcon: ({ color }) =>
            renderIcon("newspaper-variant-outline", color),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Курсы",
          tabBarIcon: ({ color }) => renderIcon("book-open-variant", color),
        }}
      />
      <Tabs.Screen
        name="consultations"
        options={{
          title: "Консультации",
          tabBarLabelStyle: {
            fontSize: 9,
          },
          tabBarIcon: ({ color }) => renderIcon("dog-side", color),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Профиль",
          tabBarIcon: ({ color }) => renderIcon("account", color),
        }}
      />
      <Tabs.Screen
        name="achievements"
        options={{
          href: null,
          title: "Достижения",
          tabBarIcon: ({ color }) => renderIcon("trophy", color),
        }}
      />
    </Tabs>
  );
}
