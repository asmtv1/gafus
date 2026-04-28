import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { COLORS } from "@/constants";
import { trackEvent } from "@/shared/lib/analytics";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
const TAB_ICON_SIZE = 30;
const SHOW_FAVORITES_TAB = false;

/** Цвет неактивного таба (иконка и подпись) */
const TAB_INACTIVE = "#6A6A6A";
/** Фон нижней панели табов */
const TAB_BAR_BG = "#F5F0E8";

/**
 * Layout нижней навигации — цвета из дизайна приложения, не зависят от темы.
 */
export default function TabsLayout() {
  const trackTabClick = (tabName: string) => {
    trackEvent({
      eventName: "button_click",
      platform: "mobile",
      pathOrScreen: "/(main)/(tabs)",
      elementId: `tab-${tabName}`,
    });
  };

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
          href: SHOW_FAVORITES_TAB ? undefined : null,
          title: "Избранное",
          tabBarIcon: ({ color }) => renderIcon("heart", color),
        }}
        listeners={{
          tabPress: () => trackTabClick("favorites"),
        }}
      />
      <Tabs.Screen
        name="pets"
        options={{
          title: "Питомцы",
          tabBarIcon: ({ color }) => renderIcon("paw", color),
        }}
        listeners={{
          tabPress: () => trackTabClick("pets"),
        }}
      />
      <Tabs.Screen
        name="articles"
        options={{
          title: "Статьи",
          tabBarIcon: ({ color }) =>
            renderIcon("newspaper-variant-outline", color),
        }}
        listeners={{
          tabPress: () => trackTabClick("articles"),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Курсы",
          tabBarIcon: ({ color }) => renderIcon("book-open-variant", color),
        }}
        listeners={{
          tabPress: () => trackTabClick("courses"),
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
        listeners={{
          tabPress: () => trackTabClick("consultations"),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Профиль",
          tabBarIcon: ({ color }) => renderIcon("account", color),
        }}
        listeners={{
          tabPress: () => trackTabClick("profile"),
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
