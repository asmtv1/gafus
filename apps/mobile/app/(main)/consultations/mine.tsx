import { useCallback, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getConsultationBookingStatusPresentation } from "@gafus/consultation-shared";
import { formatConsultationListDateTimeMsk } from "@gafus/consultation-shared";
import * as Linking from "expo-linking";
import type { Href } from "expo-router";
import { Stack, useRouter } from "expo-router";

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
    router.push("/(main)/(tabs)/consultations" as Href);
  }, [router]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Stack.Screen options={{ headerBackVisible: false }} />
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Мои консультации</Text>
        </View>

        <View style={styles.subNav}>
          <Pressable style={styles.subNavItem} onPress={onCatalog}>
            <Text style={styles.subNavText}>Каталог кинологов</Text>
          </Pressable>
          <View style={[styles.subNavItem, styles.subNavItemActive]}>
            <Text style={[styles.subNavText, styles.subNavTextActive]}>Мои консультации</Text>
          </View>
        </View>

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
          const pres = getConsultationBookingStatusPresentation(b.status, {
            cancelReason: b.cancelReason,
          });
          return (
            <View key={b.id} style={styles.card}>
              <View style={styles.badgeWrap}>
                <Text style={[styles.badge, badgeToneStyle(pres.tone)]}>{pres.badge}</Text>
              </View>
              <Text style={styles.description}>{pres.description}</Text>
              {pres.cancelReason ? (
                <Text style={styles.cancelReason}>
                  <Text style={styles.cancelReasonLabel}>Комментарий кинолога: </Text>
                  {pres.cancelReason}
                </Text>
              ) : null}
              <Text style={styles.titleLine}>
                {b.cynologistDisplayName ?? "Кинолог"} — {formatConsultationListDateTimeMsk(b.slot.startAtUtc)}
              </Text>
              {b.clientOwnerName?.trim() || b.petName?.trim() ? (
                <Text style={styles.intakeShort}>
                  {[b.clientOwnerName?.trim(), b.petName?.trim()].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
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
  hint: {
    fontFamily: FONTS.montserrat,
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  card: {
    backgroundColor: "#F5F0E8",
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: "#D4C4A8",
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
  badgePending: { backgroundColor: "#ECE5D2", color: COLORS.primaryDark },
  badgeSuccess: { backgroundColor: "rgba(72, 130, 86, 0.14)", color: "#2f5d3a" },
  badgeDanger: { backgroundColor: "rgba(180, 60, 60, 0.12)", color: "#7d2f2f" },
  badgeNeutral: { backgroundColor: "rgba(0, 0, 0, 0.06)", color: COLORS.textSecondary },
  description: { fontFamily: FONTS.montserrat, fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  cancelReason: {
    fontFamily: FONTS.montserrat,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.text,
    marginTop: SPACING.xs,
    padding: SPACING.sm,
    backgroundColor: "#ECE5D2",
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  cancelReasonLabel: { fontFamily: FONTS.montserratMedium, color: COLORS.text },
  titleLine: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 15,
    color: COLORS.text,
    marginTop: SPACING.sm,
  },
  intakeShort: {
    fontFamily: FONTS.montserrat,
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  link: { marginTop: SPACING.sm, color: COLORS.primary, fontFamily: FONTS.montserratMedium, fontSize: 14 },
  cancelBtn: {
    alignSelf: "flex-start",
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: 10,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    backgroundColor: "rgba(180, 60, 60, 0.06)",
  },
  cancelText: { color: COLORS.error, fontFamily: FONTS.montserratMedium, fontSize: 14 },
  muted: { fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.textSecondary },
  error: { color: COLORS.error, marginBottom: SPACING.md, fontFamily: FONTS.montserrat },
});
