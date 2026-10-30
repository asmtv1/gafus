import { useQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { TexturedSafeAreaView } from "@/shared/components";
import { COLORS, FONTS, SPACING } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { Loading } from "@/shared/components/ui";
import { gafusApi } from "@/shared/lib/api/gafus";
import { trackEvent } from "@/shared/lib/analytics";
import { TourTarget } from "@/shared/lib/tour-targets";

const SECTIONS = [
  {
    name: "profile",
    title: "Профиль",
    image: require("../../../assets/images/tab-icons/profile.webp"),
  },
  { name: "pets", title: "Питомцы", image: require("../../../assets/images/tab-icons/pets.webp") },
  {
    name: "questions",
    title: "Вопросы",
    image: require("../../../assets/images/tab-icons/questions.png"),
  },
  {
    name: "gallery",
    title: "Фотоальбомы",
    image: require("../../../assets/images/tab-icons/albums.webp"),
  },
  { name: "chat", title: "Сообщения", image: require("../../../assets/images/tab-icons/chat.webp") },
  {
    name: "consultations",
    title: "Кинолог",
    image: require("../../../assets/images/tab-icons/cynologist.webp"),
  },
  {
    name: "trainer-consultations",
    title: "Заявки кинолога",
    image: require("../../../assets/images/tab-icons/cynologist.webp"),
  },
  {
    name: "articles",
    title: "Статьи",
    image: require("../../../assets/images/tab-icons/articles.webp"),
  },
  {
    name: "reminders",
    title: "Напоминания о тренировках",
    image: require("../../../assets/images/profile-icons/reminders.webp"),
  },
  {
    name: "gafus",
    title: "Мои Гафусы",
    image: require("../../../assets/images/tab-icons/pets.webp"),
  },
] as const;

export default function MoreScreen() {
  const owner = useAuthStore((s) =>
    s.isAuthenticated && !s.isLoading ? (s.user?.id ?? null) : null,
  );
  const authed = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const verified = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = owner && verified?.principalId === owner ? verified.authEpoch : null;
  if (authLoading || (authed && (!owner || !epoch))) {
    return <Loading fullScreen message="Загрузка меню…" />;
  }
  return (
    <ActorMoreScreen key={`${owner ?? "guest"}:${epoch ?? "public"}`} owner={owner} epoch={epoch} />
  );
}

function ActorMoreScreen({ owner, epoch }: { owner: string | null; epoch: string | null }) {
  const router = useRouter();
  const trainerRole = useAuthStore((s) => s.user?.role === "TRAINER" && s.isAuthenticated);
  const current = () => {
    const state = useAuthStore.getState();
    const verified = newOnlyV2NativeQueues.getVerifiedBinding();
    if (state.isLoading) return false;
    if (owner && epoch)
      return (
        state.isAuthenticated &&
        state.user?.id === owner &&
        verified?.principalId === owner &&
        verified.authEpoch === epoch
      );
    return !state.isAuthenticated;
  };
  const ready = Boolean(owner && epoch);
  const gafusState = useQuery({
    queryKey: ["more-gafus-status", owner ?? "guest", epoch ?? "public"],
    queryFn: () => gafusApi.status(),
    enabled: ready,
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
          {SECTIONS.filter(
            (section) =>
              (section.name !== "gafus" ||
                (ready && !gafusState.isError && gafusState.data?.enabled.economy === true)) &&
              (section.name !== "trainer-consultations" || (ready && trainerRole)),
          ).map((section, index) => {
            const isChat = section.name === "chat";
            const loginRequired = isChat && !ready;
            const menuRow = (
              <Pressable
                key={section.name}
                accessibilityRole="button"
                accessibilityLabel={section.title}
                onPress={() => {
                  if (!current()) return;
                  if (section.name === "trainer-consultations" &&
                      useAuthStore.getState().user?.role !== "TRAINER") return;
                  if (loginRequired) {
                    Alert.alert("Чат", "Для доступа к чату войдите в аккаунт.");
                    return;
                  }
                  const name = section.name;
                  trackEvent({
                    eventName: "button_click",
                    platform: "mobile",
                    pathOrScreen: "/(main)/(tabs)/more",
                    elementId: `tab-${name}`,
                  });
                  router.navigate(
                    (name === "chat"
                      ? "/(main)/(tabs)/messages"
                      : name === "gallery"
                      ? "/(main)/(tabs)/albums"
                      : name === "trainer-consultations"
                        ? "/(main)/consultations/trainer"
                      : name === "reminders"
                        ? "/(main)/(tabs)/reminders"
                        : name === "questions"
                          ? "/(main)/(tabs)/questions"
                          : name === "gafus"
                            ? "/(main)/gafus"
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
                  {section.name === "gafus" ? (
                    <MaterialCommunityIcons name="paw" size={30} color={COLORS.primary} />
                  ) : (
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
                  )}
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.label}>{section.title}</Text>
                  {loginRequired && <Text style={styles.status}>Требуется вход в аккаунт</Text>}
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={22}
                  color={COLORS.primary}
                />
              </Pressable>
            );
            return section.name === "pets" ? (
              <TourTarget id="menu-pets" key={section.name}>
                {menuRow}
              </TourTarget>
            ) : (
              menuRow
            );
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
