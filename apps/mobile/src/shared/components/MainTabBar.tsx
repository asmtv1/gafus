import type { ComponentProps } from "react";
import type { Tabs } from "expo-router";
import { Image } from "expo-image";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, FONTS } from "@/shared/config";
import { trackEvent } from "@/shared/lib/analytics";
import { getMainTabBarSafeAreaStyle } from "@/shared/lib/tabBarSafeArea";
import { TourTarget } from "@/shared/lib/tour-targets";
import { MENU_TAB_ICON_SOURCE } from "./menuTabIconSource";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];
const TAB_LABEL_FONT_SIZE = 12;
const ITEMS = [
  {
    name: "pets",
    label: "Питомцы",
    targetId: "tab-pets",
    image: require("../../../assets/images/tab-icons/pets.webp"),
  },
  {
    name: "index",
    label: "Курсы",
    targetId: "tab-courses",
    image: require("../../../assets/images/tab-icons/courses.webp"),
  },
  { name: "more", label: "Меню", targetId: "tab-more", image: MENU_TAB_ICON_SOURCE },
] as const;

/** Второстепенные маршруты остаются вкладками, но выделяют общий вход «Меню». */
export function MainTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const currentName = state.routes[state.index]?.name;
  const selectedName = currentName === "pets" || currentName === "index" ? currentName : "more";
  const safeAreaStyle = getMainTabBarSafeAreaStyle(Platform.OS, insets.bottom);

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 16,
        paddingTop: 11,
        backgroundColor: COLORS.cardBackground,
        boxShadow: "0 -5px 14px rgba(74, 74, 30, 0.12)",
        ...safeAreaStyle,
        paddingBottom: Math.max(safeAreaStyle.paddingBottom, insets.bottom),
      }}
    >
      {ITEMS.map((item) => {
        const route = state.routes.find((entry) => entry.name === item.name);
        if (!route) return null;
        const focused = selectedName === item.name;
        const color = focused ? COLORS.primary : "#6A6A6A";
        return (
          <Pressable
            key={item.name}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: focused }}
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!event.defaultPrevented) {
                trackEvent({
                  eventName: "button_click",
                  platform: "mobile",
                  pathOrScreen: "/(main)/(tabs)",
                  elementId: `tab-${item.name === "index" ? "courses" : item.name}`,
                });
                navigation.navigate(route.name, route.params);
              }
            }}
            onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
            style={({ pressed }) => [
              styles.tabButton,
              {
                flex: 1,
                minHeight: 58,
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                paddingHorizontal: 4,
                paddingVertical: 3,
              },
              focused && styles.tabButtonSelected,
              pressed && styles.tabButtonPressed,
            ]}
          >
            <TourTarget id={item.targetId}>
              <View style={styles.tabIconWrap}>
                <Image
                  source={item.image}
                  style={{ width: item.name === "more" ? 34 : 24, height: item.name === "more" ? 28 : 24 }}
                  contentFit="contain"
                  accessible={false}
                />
              </View>
            </TourTarget>
            <Text
              style={[styles.tabLabel, { color }, focused && styles.tabLabelActive]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
    boxShadow: "inset 0 2px 5px rgba(74, 74, 30, 0.22), 0 1px 2px rgba(74, 74, 30, 0.10)",
    elevation: 1,
    transform: [{ translateY: 3 }],
  },
  tabButtonPressed: {
    backgroundColor: "#E3DCC8",
    boxShadow: "inset 0 3px 6px rgba(74, 74, 30, 0.24), 0 1px 1px rgba(74, 74, 30, 0.08)",
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
