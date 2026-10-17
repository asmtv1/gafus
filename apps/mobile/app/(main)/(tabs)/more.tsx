import { useQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CynologistChatStateDto } from "@gafus/consultation-shared";

import { TexturedSafeAreaView } from "@/shared/components";
import { COLORS, FONTS, SPACING } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { chatApi } from "@/shared/lib/api/cynologistChat";
import { gafusApi } from "@/shared/lib/api/gafus";
import { trackEvent } from "@/shared/lib/analytics";
import { TourTarget } from "@/shared/lib/tour-targets";

const SECTIONS = [
  { name: "profile", title: "Профиль", image: require("../../../assets/images/tab-icons/profile.webp") },
  { name: "pets", title: "Питомцы", image: require("../../../assets/images/tab-icons/pets.webp") },
  { name: "questions", title: "Вопросы", image: require("../../../assets/images/tab-icons/questions.png") },
  { name: "gallery", title: "Фотоальбомы", image: require("../../../assets/images/tab-icons/albums.webp") },
  { name: "chat", title: "Чат", image: require("../../../assets/images/tab-icons/chat.webp") },
  { name: "consultations", title: "Кинолог", image: require("../../../assets/images/tab-icons/cynologist.webp") },
  { name: "articles", title: "Статьи", image: require("../../../assets/images/tab-icons/articles.webp") },
  {
    name: "reminders",
    title: "Напоминания о тренировках",
    image: require("../../../assets/images/profile-icons/reminders.webp"),
  },
  { name: "gafus", title: "Мои Гафусы", image: require("../../../assets/images/tab-icons/gafus.webp") },
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
  const gafusState = useQuery({
    queryKey: ["more-gafus-status", userId],
    queryFn: () => gafusApi.status(),
    enabled: Boolean(userId),
    staleTime: 30_000,
    retry: 1,
  });

  return (
    <TexturedSafeAreaView style={{ flex: 1 }} edges={[]}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <ScrollView contentContainerStyle={styles.content}>
        <Image
          source={require("../../../assets/images/menu-header.webp")}
          style={styles.headerImage}
          contentFit="cover"
          contentPosition="center"
          accessible
          accessibilityLabel="Меню. Все разделы приложения в одном месте"
        />
        <View style={styles.menu}>
          {SECTIONS.filter(section =>
            section.name !== "gafus" || gafusState.data?.enabled.economy === true
          ).map((section, index) => {
            const isChat = section.name === "chat";
            const loading = isChat && chatState.isPending;
            const failed = isChat && chatState.isError;
            const menuRow = (
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
                      ? "/(main)/(tabs)/albums"
                      : name === "reminders"
                        ? "/(main)/(tabs)/reminders"
                      : name === "questions"
                        ? "/(main)/(tabs)/questions"
                        : name === "gafus"
                          ? "/(main)/(tabs)/gafus"
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
                      (section.name === "questions" || section.name === "gallery" ||
                        section.name === "gafus") && styles.iconSmallArtwork,
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
                  size={22}
                  color={COLORS.primary}
                />
              </Pressable>
            );
            return section.name === "pets" ? (
              <TourTarget id="menu-pets" key={section.name}>{menuRow}</TourTarget>
            ) : menuRow;
          })}
        </View>
      </ScrollView>
    </TexturedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  headerImage: {
    height: 180,
    marginHorizontal: -SPACING.md,
    marginTop: -SPACING.md,
    marginBottom: SPACING.md,
  },
  menu: { backgroundColor: COLORS.cardBackground, borderRadius: 22, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    minHeight: 64,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
  },
  separator: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderLight },
  pressed: { backgroundColor: "#E9E2CF" },
  iconSlot: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  icon: { width: 36, height: 36 },
  iconSmallArtwork: { width: 44, height: 44 },
  label: { fontFamily: FONTS.montserratMedium, fontSize: 16, color: COLORS.text },
  status: {
    fontFamily: FONTS.montserrat,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textSecondary,
  },
});
