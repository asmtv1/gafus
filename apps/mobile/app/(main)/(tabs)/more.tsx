import { useQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CynologistChatStateDto } from "@gafus/consultation-shared";

import { TexturedSafeAreaView } from "@/shared/components";
import { COLORS, FONTS, SPACING } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { chatApi } from "@/shared/lib/api/cynologistChat";
import { feedApi } from "@/shared/lib/api/feed";
import { trackEvent } from "@/shared/lib/analytics";

const SECTIONS = [
  { name: "questions", title: "Вопросы", image: require("../../../assets/images/tab-icons/questions.png") },
  {
    name: "articles",
    title: "Статьи",
    image: require("../../../assets/images/tab-icons/articles.webp"),
  },
  {
    name: "consultations",
    title: "Кинолог",
    image: require("../../../assets/images/tab-icons/cynologist.webp"),
  },
  { name: "chat", title: "Чат", image: require("../../../assets/images/tab-icons/chat.webp") },
  {
    name: "gallery",
    title: "Фотоальбомы",
    image: require("../../../assets/images/tab-icons/albums.webp"),
  },
  {
    name: "feed",
    title: "Лента",
    image: require("../../../assets/images/tab-icons/articles.webp"),
  },
  {
    name: "profile",
    title: "Профиль",
    image: require("../../../assets/images/tab-icons/profile.webp"),
  },
] as const;

export default function MoreScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const chatState = useQuery({
    queryKey: ["more-chat-role", userId],
    queryFn: () => chatApi<CynologistChatStateDto>(),
    enabled: Boolean(userId),
    retry: 1,
  });
  const feedState = useQuery({
    queryKey: ["more-feed-ready", userId],
    queryFn: () => feedApi.status(),
    enabled: Boolean(userId),
    staleTime: 30_000,
    retry: 1,
  });

  return (
    <TexturedSafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.menu}>
          {SECTIONS.filter(section => section.name !== "feed" || feedState.data?.enabled === true).map((section, index) => {
            const isChat = section.name === "chat";
            const loading = isChat && chatState.isPending;
            const failed = isChat && chatState.isError;
            return (
              <Pressable
                key={section.name}
                accessibilityRole="button"
                accessibilityLabel={failed ? "Чат. Повторить загрузку" : section.title}
                accessibilityState={{ disabled: loading, busy: loading }}
                disabled={loading}
                onPress={() => {
                  if (failed) {
                    void chatState.refetch();
                    return;
                  }
                  const name = isChat
                    ? chatState.data?.isAssignedTrainer
                      ? "cynologist-chats"
                      : "cynologist-chat"
                    : section.name;
                  trackEvent({
                    eventName: "button_click",
                    platform: "mobile",
                    pathOrScreen: "/(main)/(tabs)/more",
                    elementId: `tab-${name}`,
                  });
                  router.navigate(
                    (name === "gallery"
                      ? "/profile/albums"
                      : name === "questions"
                        ? "/questions"
                        : `/(main)/(tabs)/${name}`) as Href,
                  );
                }}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && styles.separator,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.iconSlot}>
                  <Image
                    source={section.image}
                    style={[
                      styles.icon,
                      (section.name === "questions" || section.name === "gallery") &&
                        styles.iconSmallArtwork,
                    ]}
                    contentFit="contain"
                    accessible={false}
                  />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.label}>{section.title}</Text>
                  {loading && <Text style={styles.status}>Загрузка…</Text>}
                  {failed && (
                    <Text style={styles.status}>
                      Не удалось загрузить. Нажмите, чтобы повторить
                    </Text>
                  )}
                </View>
                <MaterialCommunityIcons
                  name={failed ? "refresh" : "chevron-right"}
                  size={24}
                  color={COLORS.primary}
                />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </TexturedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  menu: { backgroundColor: COLORS.cardBackground, borderRadius: 22, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    minHeight: 80,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  separator: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderLight },
  pressed: { backgroundColor: "#E9E2CF" },
  iconSlot: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  icon: { width: 40, height: 40 },
  iconSmallArtwork: { width: 52, height: 52 },
  label: { fontFamily: FONTS.montserratMedium, fontSize: 17, color: COLORS.text },
  status: {
    fontFamily: FONTS.montserrat,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textSecondary,
  },
});
