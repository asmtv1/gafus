import { useCallback, useEffect, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { cynologistDisplayInitials, plainConsultationAboutHtml } from "@gafus/consultation-shared";
import type { ListedCynologistCardDto } from "@gafus/consultation-shared";
import { Image } from "expo-image";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";

import { COLORS, FONTS, SPACING } from "@/shared/config";
import { TourTarget } from "@/shared/lib/tour-targets";
import { consultationsApi } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { resolveImageUrl } from "@/shared/lib/utils/resolveImageUrl";
import { trackEvent } from "@/shared/lib/analytics";

/**
 * Каталог кинологов — паритет с web (карточки, поднавигация, тексты).
 */
export default function ConsultationsCynologistsListScreen() {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["consultations", "cynologists"],
    queryFn: async () => {
      const res = await consultationsApi.listCynologists();
      if (!res.success) {
        throw new Error(res.error ?? "Ошибка загрузки");
      }
      return res.data ?? [];
    },
  });

  const items = useMemo(() => query.data ?? [], [query.data]);

  useEffect(() => {
    if (query.isError && query.error) {
      reportClientError(
        query.error instanceof Error ? query.error : new Error(String(query.error)),
        { issueKey: "consultation", keys: { screen: "list" } },
      );
    }
  }, [query.isError, query.error]);

  const onOpen = useCallback(
    (c: ListedCynologistCardDto) => {
      hapticFeedback.medium();
      trackEvent({
        eventName: "button_click",
        platform: "mobile",
        pathOrScreen: "/consultations",
        elementId: "consultation-cynologist-open",
      });
      const q = new URLSearchParams({
        displayName: c.displayName ?? "",
        slotDurationMin: String(c.slotDurationMin),
      });
      router.push(`/consultations/${encodeURIComponent(c.userId)}?${q.toString()}` as Href);
    },
    [router],
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TourTarget id="consultations-list">
          <View style={styles.header}>
            <Text style={styles.pageTitle}>Консультации с кинологом</Text>
          </View>
        </TourTarget>

        <View style={styles.subNav}>
          <View style={[styles.subNavItem, styles.subNavItemActive]}>
            <Text style={[styles.subNavText, styles.subNavTextActive]}>Каталог кинологов</Text>
          </View>
          <Pressable
            style={styles.subNavItem}
            onPress={() => {
              hapticFeedback.light();
              router.push("/(main)/(tabs)/consultations?view=mine" as Href);
            }}
          >
            <Text style={styles.subNavText}>Мои консультации</Text>
          </Pressable>
        </View>

        <Text style={styles.intro}>
          Выберите кинолога и свободный слот. После записи тренер подтвердит встречу — на почту
          придут уведомления.
        </Text>

        {query.isError ? (
          <Text style={styles.error}>Не удалось загрузить список. Попробуйте позже.</Text>
        ) : null}
        {query.isLoading ? <Text style={styles.muted}>Загрузка…</Text> : null}
        {!query.isLoading && items.length === 0 ? (
          <Text style={styles.muted}>
            Пока нет доступных кинологов для записи. Загляните позже.
          </Text>
        ) : null}

        {!query.isLoading && items.length > 0 ? (
          <Text style={styles.sectionTitle}>Кинологи</Text>
        ) : null}

        {items.map((c) => {
          const src = resolveImageUrl(c.avatarUrl);
          const about = plainConsultationAboutHtml(c.about);
          const title = c.displayName ?? "Кинолог";
          return (
            <Pressable key={c.id} style={styles.card} onPress={() => onOpen(c)}>
              <View style={styles.cardInner}>
                <View style={styles.avatarFrame}>
                  {src ? (
                    <Image source={{ uri: src }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <Text style={styles.avatarPlaceholder}>
                      {cynologistDisplayInitials(c.displayName)}
                    </Text>
                  )}
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.title}>{title}</Text>
                  {about ? (
                    <Text style={styles.about}>{about}</Text>
                  ) : (
                    <Text style={styles.aboutEmpty}>
                      Описание появится, когда кинолог заполнит профиль.
                    </Text>
                  )}
                  <View style={styles.meta}>
                    <Text style={styles.metaLine}>
                      Длительность слота: {c.slotDurationMin} мин. · Часовой пояс: МСК (UTC+3)
                    </Text>
                    <View style={styles.ctaPill}>
                      <Text style={styles.cta}>Выбрать слот →</Text>
                    </View>
                  </View>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: {
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xl,
  },
  header: {
    paddingBottom: SPACING.sm,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "400",
    fontFamily: FONTS.impact,
    color: "#352E2E",
    textAlign: "center",
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  subNav: {
    flexDirection: "row",
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  subNavItem: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    backgroundColor: "#F5F0E8",
  },
  subNavItemActive: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: "#ECE5D2",
  },
  subNavText: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 15,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  subNavTextActive: { color: COLORS.primaryDark },
  intro: {
    fontFamily: FONTS.montserrat,
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    lineHeight: 20,
  },
  sectionTitle: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 18,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  card: {
    backgroundColor: "#F5F0E8",
    borderRadius: 12,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    overflow: "hidden",
  },
  cardInner: { flexDirection: "row", padding: SPACING.md, gap: SPACING.md },
  avatarFrame: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: "hidden",
    backgroundColor: "#ECE5D2",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: { width: 96, height: 96 },
  avatarPlaceholder: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 28,
    color: COLORS.textSecondary,
  },
  cardBody: { flex: 1, minWidth: 0 },
  title: { fontFamily: FONTS.montserratMedium, fontSize: 17, color: COLORS.text },
  about: {
    fontFamily: FONTS.montserrat,
    fontSize: 14,
    color: COLORS.text,
    marginTop: SPACING.xs,
    lineHeight: 20,
  },
  aboutEmpty: {
    fontFamily: FONTS.montserrat,
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    fontStyle: "italic",
  },
  meta: { marginTop: SPACING.sm },
  metaLine: { fontFamily: FONTS.montserrat, fontSize: 12, color: COLORS.textSecondary },
  ctaPill: {
    alignSelf: "flex-start",
    marginTop: SPACING.sm,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  cta: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 14,
    color: "#ECE5D2",
  },
  muted: { fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.textSecondary },
  error: { color: COLORS.error, marginBottom: SPACING.md, fontFamily: FONTS.montserrat },
});
