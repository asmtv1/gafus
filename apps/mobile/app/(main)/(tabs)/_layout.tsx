import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, FONTS } from "@/shared/config";
import type { MobileOnboardingTourTargetId } from "@/features/onboarding-tour";
import { trackEvent } from "@/shared/lib/analytics";
import { getMainTabBarSafeAreaStyle } from "@/shared/lib/tabBarSafeArea";
import { TourTarget } from "@/shared/lib/tour-targets";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
const TAB_ICON_SIZE = 24;
const TAB_LABEL_FONT_SIZE = 12;
const SHOW_FAVORITES_TAB = false;

/** Цвет неактивного таба (иконка и подпись) */
const TAB_INACTIVE = "#6A6A6A";
/** Фон нижней панели табов */
const TAB_BAR_BG = "#F5F0E8";

/**
 * Layout нижней навигации — цвета из дизайна приложения, не зависят от темы.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const androidSafeAreaStyle = getMainTabBarSafeAreaStyle(Platform.OS, insets.bottom);

  const trackTabClick = (tabName: string) => {
    trackEvent({
      eventName: "button_click",
      platform: "mobile",
      pathOrScreen: "/(main)/(tabs)",
      elementId: `tab-${tabName}`,
    });
  };

  const renderIcon = (name: IconName, color: string, focused: boolean) => (
    <View style={styles.tabIconWrap}>
      <MaterialCommunityIcons
        name={name}
        size={TAB_ICON_SIZE}
        color={focused ? COLORS.primary : color}
      />
    </View>
  );
  const renderTargetedIcon = (
    targetId: MobileOnboardingTourTargetId,
    name: IconName,
    color: string,
    focused: boolean,
  ) => <TourTarget id={targetId}>{renderIcon(name, color, focused)}</TourTarget>;
  const renderTabLabel = (label: string, color: string, focused: boolean) => (
    <Text
      style={[styles.tabLabel, { color }, focused && styles.tabLabelActive]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.85}
    >
      {label}
    </Text>
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: TAB_INACTIVE,
        tabBarAllowFontScaling: false,
        tabBarLabelStyle: {
          fontFamily: FONTS.montserrat,
          fontSize: TAB_LABEL_FONT_SIZE,
          lineHeight: 14,
          textAlign: "center",
          includeFontPadding: false,
        },
        tabBarButton: ({ children, style, ref: _ref, ...props }) => {
          const isSelected =
            props["aria-selected"] === true || props.accessibilityState?.selected === true;

          return (
            <Pressable
              {...props}
              style={({ pressed }) => [
                style,
                styles.tabButton,
                isSelected && styles.tabButtonSelected,
                pressed && styles.tabButtonPressed,
              ]}
            >
              {children}
            </Pressable>
          );
        },
        tabBarItemStyle: {
          minHeight: 58,
          marginVertical: 6,
          paddingHorizontal: 2,
          paddingVertical: 3,
        },
        tabBarStyle: {
          backgroundColor: TAB_BAR_BG,
          borderTopWidth: 0,
          gap: 6,
          paddingHorizontal: 16,
          paddingTop: 5,
          shadowColor: "#4A4A1E",
          shadowOffset: { width: 0, height: -5 },
          shadowOpacity: 0.12,
          shadowRadius: 14,
          elevation: 14,
          ...androidSafeAreaStyle,
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
          tabBarIcon: ({ color, focused }) => renderIcon("heart", color, focused),
        }}
        listeners={{
          tabPress: () => trackTabClick("favorites"),
        }}
      />
      <Tabs.Screen
        name="pets"
        options={{
          title: "Питомцы",
          tabBarLabel: ({ color, focused }) => renderTabLabel("Питомцы", color, focused),
          tabBarIcon: ({ color, focused }) => renderTargetedIcon("tab-pets", "paw", color, focused),
        }}
        listeners={{
          tabPress: () => trackTabClick("pets"),
        }}
      />
      <Tabs.Screen
        name="articles"
        options={{
          title: "Статьи",
          tabBarLabel: ({ color, focused }) => renderTabLabel("Статьи", color, focused),
          tabBarIcon: ({ color, focused }) =>
            renderIcon("newspaper-variant-outline", color, focused),
        }}
        listeners={{
          tabPress: () => trackTabClick("articles"),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Курсы",
          tabBarLabel: ({ color, focused }) => renderTabLabel("Курсы", color, focused),
          tabBarIcon: ({ color, focused }) =>
            renderTargetedIcon("tab-courses", "book-open-variant", color, focused),
        }}
        listeners={{
          tabPress: () => trackTabClick("courses"),
        }}
      />
      <Tabs.Screen
        name="consultations"
        options={{
          title: "Консультации",
          tabBarLabel: ({ color, focused }) => renderTabLabel("Кинолог", color, focused),
          tabBarIcon: ({ color, focused }) =>
            renderTargetedIcon("tab-consultations", "dog-side", color, focused),
        }}
        listeners={{
          tabPress: () => trackTabClick("consultations"),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Профиль",
          tabBarLabel: ({ color, focused }) => renderTabLabel("Профиль", color, focused),
          tabBarIcon: ({ color, focused }) => renderIcon("account", color, focused),
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
          tabBarIcon: ({ color, focused }) => renderIcon("trophy", color, focused),
        }}
      />
    </Tabs>
  );
}

const styles = {
  tabButton: {
    backgroundColor: "#FBF7EF",
    borderRadius: 18,
    borderCurve: "continuous" as const,
    boxShadow: "0 4px 8px rgba(74, 74, 30, 0.18)",
    elevation: 5,
  },
  tabButtonSelected: {
    backgroundColor: "#E9E2CF",
    boxShadow:
      "inset 0 2px 5px rgba(74, 74, 30, 0.22), 0 1px 2px rgba(74, 74, 30, 0.10)",
    elevation: 1,
    transform: [{ translateY: 3 }],
  },
  tabButtonPressed: {
    backgroundColor: "#E3DCC8",
    boxShadow:
      "inset 0 3px 6px rgba(74, 74, 30, 0.24), 0 1px 1px rgba(74, 74, 30, 0.08)",
    elevation: 0,
    transform: [{ translateY: 4 }, { scale: 0.98 }],
  },
  tabIconWrap: {
    minWidth: 36,
    height: 28,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  tabLabel: {
    fontFamily: FONTS.montserrat,
    fontSize: TAB_LABEL_FONT_SIZE,
    lineHeight: 13,
    textAlign: "center" as const,
  },
  tabLabelActive: {
    fontFamily: FONTS.montserratBold,
    color: COLORS.primary,
  },
};
