import { useCallback, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  formatConsultationListDateTimeMsk,
  getConsultationBookingStatusPresentation,
} from "@gafus/core";
import * as Linking from "expo-linking";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";

import { COLORS, FONTS, SPACING } from "@/constants";
import { consultationsApi } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";

/**
 * Мои бронирования — паритет с web (бейджи статусов, подсказка МСК).
 */
export default function ConsultationsMineScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["consultations", "mine"],
    queryFn: async () => {
      const res = await consultationsApi.myBookings();
      if (!res.success) {
        throw new Error(res.error ?? "Ошибка");
      }
      return res.data ?? { items: [], nextCursor: null };
    },
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  const cancelMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await consultationsApi.cancelBooking(bookingId);
      if (!res.success) {
        throw new Error(res.error ?? "Ошибка отмены");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["consultations", "mine"] });
    },
    onError: (e: unknown) => {
      reportClientError(e instanceof Error ? e : new Error(String(e)), {
        issueKey: "consultation",
        keys: { screen: "mine" },
      });
    },
  });

  const canCancel = useCallback((status: string) => {
    return status === "PENDING_TRAINER_CONFIRMATION" || status === "CONFIRMED";
  }, []);

  const onCatalog = useCallback(() => {
    hapticFeedback.light();
    router.push("/consultations" as Href);
  }, [router]);

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.pageTitle}>Мои консультации</Text>

        <View style={styles.subNav}>
          <Pressable style={styles.subNavItem} onPress={onCatalog}>
            <Text style={styles.subNavText}>Каталог кинологов</Text>
          </Pressable>
          <View style={[styles.subNavItem, styles.subNavItemActive]}>
            <Text style={[styles.subNavText, styles.subNavTextActive]}>Мои консультации</Text>
          </View>
        </View>

        <Pressable style={styles.linkRow} onPress={onCatalog}>
          <Text style={styles.linkText}>← К списку кинологов</Text>
        </Pressable>

        <Text style={styles.hint}>Все консультации отображаются по времени МСК (UTC+3).</Text>

        {query.isLoading ? <Text style={styles.muted}>Загрузка…</Text> : null}
        {query.isError ? (
          <Text style={styles.error}>Не удалось загрузить записи.</Text>
        ) : null}
        {items.length === 0 && !query.isLoading ? (
          <Text style={styles.muted}>
            Пока нет записей. Выберите кинолога в каталоге и забронируйте удобное время.
          </Text>
        ) : null}

        {items.map((b) => {
          const pres = getConsultationBookingStatusPresentation(b.status);
          return (
            <View key={b.id} style={styles.card}>
              <View style={styles.badgeWrap}>
                <Text style={[styles.badge, badgeToneStyle(pres.tone)]}>{pres.badge}</Text>
              </View>
              <Text style={styles.description}>{pres.description}</Text>
              <Text style={styles.titleLine}>
                {b.cynologistDisplayName ?? "Кинолог"} — {formatConsultationListDateTimeMsk(b.slot.startAtUtc)}
              </Text>
              {b.status === "CONFIRMED" && b.joinUrl ? (
                <Pressable onPress={() => void Linking.openURL(b.joinUrl!)}>
                  <Text style={styles.link}>Перейти к видеовстрече</Text>
                </Pressable>
              ) : null}
              {canCancel(b.status) ? (
                <Pressable
                  style={styles.cancelBtn}
                  disabled={cancelMutation.isPending}
                  onPress={() => {
                    hapticFeedback.medium();
                    cancelMutation.mutate(b.id);
                  }}
                >
                  <Text style={styles.cancelText}>Отменить запись</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function badgeToneStyle(tone: "pending" | "success" | "danger" | "neutral") {
  switch (tone) {
    case "success":
      return styles.badgeSuccess;
    case "danger":
      return styles.badgeDanger;
    case "pending":
      return styles.badgePending;
    default:
      return styles.badgeNeutral;
  }
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
  linkRow: { marginBottom: SPACING.sm },
  linkText: { fontFamily: FONTS.montserratMedium, fontSize: 14, color: COLORS.primary },
  hint: {
    fontFamily: FONTS.montserrat,
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  badgeWrap: { marginBottom: SPACING.xs },
  badge: {
    alignSelf: "flex-start",
    fontFamily: FONTS.montserratMedium,
    fontSize: 12,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
  },
  badgePending: { backgroundColor: "rgba(180, 140, 60, 0.2)", color: COLORS.text },
  badgeSuccess: { backgroundColor: "rgba(60, 140, 80, 0.2)", color: COLORS.text },
  badgeDanger: { backgroundColor: "rgba(180, 60, 60, 0.15)", color: COLORS.text },
  badgeNeutral: { backgroundColor: COLORS.borderLight, color: COLORS.textSecondary },
  description: { fontFamily: FONTS.montserrat, fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  titleLine: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 15,
    color: COLORS.text,
    marginTop: SPACING.sm,
  },
  link: { marginTop: SPACING.sm, color: COLORS.primary, fontFamily: FONTS.montserratMedium, fontSize: 14 },
  cancelBtn: { alignSelf: "flex-start", marginTop: SPACING.sm },
  cancelText: { color: COLORS.error, fontFamily: FONTS.montserratMedium, fontSize: 14 },
  muted: { fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.textSecondary },
  error: { color: COLORS.error, marginBottom: SPACING.md, fontFamily: FONTS.montserrat },
});
