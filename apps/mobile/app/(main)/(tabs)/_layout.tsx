import { useEffect, useState } from "react";
import { useAuthStore } from "@/shared/stores";
import { chatApi } from "@/shared/lib/api/cynologistChat";
import type { CynologistChatStateDto } from "@gafus/consultation-shared";
import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, FONTS } from "@/shared/config";
import type { MobileOnboardingTourTargetId } from "@/features/onboarding-tour";
import { trackEvent } from "@/shared/lib/analytics";
import { TourTarget } from "@/shared/lib/tour-targets";
import { GardenTabBarBackground } from "@/shared/components/GardenTabBarBackground";
import { AnimatedTabBarButton } from "@/shared/components/AnimatedTabBarButton";
import { SharedSkyBackground } from "@/shared/components/SharedSkyBackground";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
const TAB_ICON_SIZE = 24;
const TAB_IMAGES: Partial<Record<IconName, number>> = {
  "book-open-variant": require("../../../assets/images/tab-icons/courses.webp"),
  chat: require("../../../assets/images/tab-icons/chat.webp"),
  "dog-side": require("../../../assets/images/tab-icons/cynologist.webp"),
  account: require("../../../assets/images/tab-icons/profile.webp"),
  "newspaper-variant-outline": require("../../../assets/images/tab-icons/articles.webp"),
  paw: require("../../../assets/images/tab-icons/pets.webp"),
};
const TAB_LABEL_FONT_SIZE = 12;
const SHOW_FAVORITES_TAB = false;

/** Цвет неактивного таба (иконка и подпись) */
const TAB_INACTIVE = "#655034";

/**
 * Layout нижней навигации — цвета из дизайна приложения, не зависят от темы.
 */
export default function TabsLayout() {
  const userId = useAuthStore((s) => s.user?.id);
  const [assignedTrainer, setAssignedTrainer] = useState(false);
  useEffect(() => {
    let alive = true;
    setAssignedTrainer(false);
    if (userId) {
      chatApi<CynologistChatStateDto>()
        .then((state) => { if (alive) setAssignedTrainer(state.isAssignedTrainer); })
        .catch(() => undefined);
    }
    return () => { alive = false; };
  }, [userId]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const gardenImageHeight = width * (783 / 2009);
  const bottomInset = Math.max(8, insets.bottom);

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
      {TAB_IMAGES[name] ? (
        <Image
          source={TAB_IMAGES[name]}
          style={{ width: TAB_ICON_SIZE, height: TAB_ICON_SIZE }}
          contentFit="contain"
          accessible={false}
        />
      ) : (
        <MaterialCommunityIcons
          name={name}
          size={TAB_ICON_SIZE}
          color={focused ? COLORS.primary : color}
        />
      )}
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
    <SharedSkyBackground>
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: "transparent" },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: TAB_INACTIVE,
        tabBarAllowFontScaling: false,
        tabBarBackground: () => (
          <GardenTabBarBackground imageHeight={gardenImageHeight} />
        ),
        tabBarLabelStyle: {
          fontFamily: FONTS.montserrat,
          fontSize: TAB_LABEL_FONT_SIZE,
          lineHeight: 14,
          textAlign: "center",
          includeFontPadding: false,
        },
        tabBarButton: (props) => <AnimatedTabBarButton {...props} />,
        tabBarItemStyle: {
          height: 48,
          paddingHorizontal: 0,
          paddingVertical: 2,
        },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "transparent",
          borderTopWidth: 0,
          height: gardenImageHeight * 0.58 + bottomInset,
          paddingHorizontal: width * 0.02,
          paddingTop: Math.max(0, gardenImageHeight * 0.58 - 48),
          paddingBottom: bottomInset,
          shadowOpacity: 0,
          elevation: 0,
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
        name="cynologist-chat"
        options={{
          title: "Чат с кинологом",
          href: assignedTrainer ? null : undefined,
          tabBarLabel: ({ color, focused }) => renderTabLabel("Чат", color, focused),
          tabBarIcon: ({ color, focused }) =>
            renderIcon("chat", color, focused),
        }}
        listeners={{
          tabPress: () => trackTabClick("cynologist-chat"),
        }}
      />
      <Tabs.Screen
        name="cynologist-chats"
        options={{
          title: "Чат",
          href: assignedTrainer ? undefined : null,
          tabBarLabel: ({ color, focused }) => renderTabLabel("Чат", color, focused),
          tabBarIcon: ({ color, focused }) =>
            renderIcon("chat", color, focused),
        }}
        listeners={{
          tabPress: () => trackTabClick("cynologist-chats"),
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
    </SharedSkyBackground>
  );
}

const styles = {
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
