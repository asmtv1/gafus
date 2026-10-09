import { Tabs } from "expo-router";
import { MainTabBar } from "@/shared/components/MainTabBar";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <MainTabBar {...props} />}>
      <Tabs.Screen name="pets" options={{ title: "Питомцы" }} />
      <Tabs.Screen name="index" options={{ title: "Курсы" }} />
      <Tabs.Screen name="more" options={{ title: "Меню" }} />
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
