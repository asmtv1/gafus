import { Tabs, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text } from "react-native";
import { MainTabBar } from "@/shared/components/MainTabBar";
import { PaperTextureBackground } from "@/shared/components";
import { COLORS, FONTS } from "@/shared/config";

export default function TabsLayout() {
  const router = useRouter();
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <MainTabBar {...props} />}>
      <Tabs.Screen name="pets" options={{ title: "Питомцы" }} />
      <Tabs.Screen name="index" options={{ title: "Курсы" }} />
      <Tabs.Screen name="more" options={{ title: "Меню" }} />
      <Tabs.Screen
        name="albums"
        options={{
          title: "Альбомы",
          href: null,
          headerShown: true,
          headerTitleAlign: "center",
          headerShadowVisible: false,
          headerStyle: { backgroundColor: COLORS.background },
          headerBackground: () => <PaperTextureBackground />,
          headerTintColor: COLORS.text,
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Назад в меню"
              onPress={() => router.navigate("/(main)/(tabs)/more")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                minHeight: 44,
                paddingHorizontal: 12,
                borderRadius: 24,
                backgroundColor: COLORS.cardBackground,
                marginLeft: 8,
              }}
            >
              <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.text} />
              <Text style={{ fontFamily: FONTS.montserratMedium, fontSize: 16, color: COLORS.text }}>
                Назад
              </Text>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen name="questions" options={{ title: "Вопросы", href: null }} />
      <Tabs.Screen name="feed" options={{ title: "Лента", href: null }} />
      <Tabs.Screen name="articles" options={{ title: "Статьи", href: null }} />
      <Tabs.Screen name="consultations" options={{ title: "Консультации", href: null }} />
      <Tabs.Screen name="cynologist-chat" options={{ title: "Чат с кинологом", href: null }} />
      <Tabs.Screen name="cynologist-chats" options={{ title: "Чат", href: null }} />
      <Tabs.Screen name="profile" options={{ title: "Профиль", href: null }} />
      <Tabs.Screen name="courses" options={{ title: "Избранное", href: null }} />
      <Tabs.Screen name="achievements" options={{ title: "Достижения", href: null }} />
    </Tabs>
  );
}
