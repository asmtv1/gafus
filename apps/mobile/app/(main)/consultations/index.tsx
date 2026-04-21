import { useCallback, useEffect, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import {
  cynologistDisplayInitials,
  plainConsultationAboutHtml,
  type ListedCynologistCardDto,
} from "@gafus/core";
import { Image } from "expo-image";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";

import { COLORS, FONTS, SPACING } from "@/constants";
import { consultationsApi } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { resolveImageUrl } from "@/shared/lib/utils/resolveImageUrl";

/**
 * Каталог кинологов — паритет с web (карточки, поднавигация, тексты).
 */
export default function ConsultationsListScreen() {
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
      const q = new URLSearchParams({
        displayName: c.displayName ?? "",
        slotDurationMin: String(c.slotDurationMin),
      });
      router.push(`/consultations/${encodeURIComponent(c.userId)}?${q.toString()}` as Href);
    },
    [router],
  );

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.pageTitle}>Консультации с кинологом</Text>

        <View style={styles.subNav}>
          <View style={[styles.subNavItem, styles.subNavItemActive]}>
            <Text style={[styles.subNavText, styles.subNavTextActive]}>Каталог кинологов</Text>
          </View>
          <Pressable
            style={styles.subNavItem}
            onPress={() => {
              hapticFeedback.light();
              router.push("/consultations/mine" as Href);
            }}
          >
            <Text style={styles.subNavText}>Мои консультации</Text>
          </Pressable>
        </View>

        <Text style={styles.intro}>
          Выберите кинолога и свободный слот. После записи тренер подтвердит встречу — на почту придут
          уведомления.
        </Text>

        {query.isError ? (
          <Text style={styles.error}>Не удалось загрузить список. Попробуйте позже.</Text>
        ) : null}
        {query.isLoading ? <Text style={styles.muted}>Загрузка…</Text> : null}
        {!query.isLoading && items.length === 0 ? (
          <Text style={styles.muted}>Пока нет доступных кинологов для записи. Загляните позже.</Text>
        ) : null}

        {!query.isLoading && items.length > 0 ? <Text style={styles.sectionTitle}>Кинологи</Text> : null}

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
                    <Text style={styles.avatarPlaceholder}>{cynologistDisplayInitials(c.displayName)}</Text>
                  )}
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.title}>{title}</Text>
                  {about ? (
                    <Text style={styles.about} numberOfLines={6}>
                      {about}
                    </Text>
                  ) : (
                    <Text style={styles.aboutEmpty}>Описание появится, когда кинолог заполнит профиль.</Text>
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
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xl },
  pageTitle: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 22,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  subNav: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  subNavItem: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
  },
  subNavItemActive: {
    borderColor: COLORS.primary,
    backgroundColor: "rgba(139, 90, 43, 0.08)",
  },
  subNavText: { fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.textSecondary },
  subNavTextActive: { fontFamily: FONTS.montserratMedium, color: COLORS.primary },
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
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: "hidden",
  },
  cardInner: { flexDirection: "row", padding: SPACING.md, gap: SPACING.md },
  avatarFrame: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: "hidden",
    backgroundColor: COLORS.borderLight,
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
  about: { fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.text, marginTop: SPACING.xs, lineHeight: 20 },
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
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.cardBackground,
    shadowColor: "#4a4920",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  cta: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 14,
    color: COLORS.primaryDark,
  },
  muted: { fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.textSecondary },
  error: { color: COLORS.error, marginBottom: SPACING.md, fontFamily: FONTS.montserrat },
});
