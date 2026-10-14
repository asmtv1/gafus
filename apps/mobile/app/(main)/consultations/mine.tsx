import { useCallback, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getConsultationBookingStatusPresentation } from "@gafus/consultation-shared";
import { formatConsultationListDateTimeMsk } from "@gafus/consultation-shared";
import * as Linking from "expo-linking";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import { Stack, useRouter } from "expo-router";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";

import { COLORS, FONTS, SPACING } from "@/shared/config";
import { Loading, TexturedSafeAreaView } from "@/shared/components";
import { Button } from "@/shared/components/ui";
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
    <TexturedSafeAreaView style={styles.root} edges={[]}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Stack.Screen options={{ headerBackVisible: false }} />
        <Image
          source={require("../../../assets/images/consultations-mine-header.png")}
          style={styles.headerImage}
          contentFit="cover"
          accessible
          accessibilityLabel="Мои консультации. Все встречи и изменения по записи собраны в одном месте"
        />
        <View style={styles.content}>

        <View style={styles.subNav}>
          <Button
            label="Каталог кинологов"
            variant="primary"
            flex={1}
            fullWidth={false}
            height={52}
            fontSize={12}
            lineHeight={18}
            fontFamily={FONTS.montserratMedium}
            horizontalPadding={6}
            verticalPadding={0}
            borderRadius={12}
            animatedPress
            compact
            haptic={false}
            onPress={onCatalog}
            accessibilityRole="radio"
            accessibilityState={{ checked: false }}
          />
          <Button
            label="Мои консультации"
            variant="selected"
            flex={1}
            fullWidth={false}
            height={52}
            fontSize={12}
            lineHeight={18}
            fontFamily={FONTS.montserratMedium}
            horizontalPadding={6}
            verticalPadding={0}
            borderRadius={12}
            animatedPress
            compact
            haptic={false}
            accessibilityRole="radio"
            accessibilityState={{ checked: true }}
          />
        </View>

        <View style={styles.timezoneNote}>
          <MaterialCommunityIcons name="clock-outline" size={18} color={COLORS.primaryDark} />
          <Text style={styles.hint}>Все консультации отображаются по времени МСК (UTC+3).</Text>
        </View>

        {query.isLoading ? (
          <Loading variant="inline" message="Загружаем ваши консультации…" />
        ) : null}
        {query.isError ? <Text style={styles.error}>Не удалось загрузить записи.</Text> : null}
        {items.length === 0 && !query.isLoading && !query.isError ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons
                name="calendar-blank-outline"
                size={31}
                color={COLORS.primary}
              />
            </View>
            <Text style={styles.emptyTitle}>Здесь появятся ваши записи</Text>
            <Text style={styles.emptyText}>
              Выберите кинолога в каталоге и забронируйте удобное время для консультации.
            </Text>
            <Button
              label="Найти кинолога"
              width={232}
              fullWidth={false}
              style={styles.catalogCta}
              onPress={onCatalog}
              accessibilityRole="button"
              accessibilityLabel="Перейти в каталог кинологов"
              accessibilityHint="Открывает список специалистов и свободных слотов"
            />
          </View>
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
                {b.cynologistDisplayName ?? "Кинолог"} —{" "}
                {formatConsultationListDateTimeMsk(b.slot.startAtUtc)}
              </Text>
              {b.clientOwnerName?.trim() || b.petName?.trim() ? (
                <Text style={styles.intakeShort}>
                  {[b.clientOwnerName?.trim(), b.petName?.trim()].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
              {b.status === "CONFIRMED" ? (
                <Button
                  label="Видеовстреча в браузере"
                  icon="video-outline"
                  iconPosition="right"
                  fullWidth={false}
                  height={44}
                  fontFamily={FONTS.montserratMedium}
                  fontSize={14}
                  lineHeight={18}
                  horizontalPadding={SPACING.md}
                  verticalPadding={0}
                  borderRadius={14}
                  style={styles.videoCtaLayout}
                  onPress={() => void Linking.openURL(`https://gafus.ru/consultations/call/${encodeURIComponent(b.id)}`)}
                  accessibilityRole="link"
                  accessibilityLabel="Перейти к видеовстрече"
                />
              ) : null}
              {canCancel(b.status) ? (
                <Pressable
                  style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
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
        </View>
      </ScrollView>
    </TexturedSafeAreaView>
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
  scroll: { paddingBottom: SPACING.xxl },
  headerImage: { width: "100%", height: 180 },
  content: { padding: SPACING.md },
  subNav: {
    flexDirection: "row",
    gap: SPACING.xs,
    marginBottom: SPACING.lg,
  },
  timezoneNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.xs,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.sm,
  },
  hint: {
    fontFamily: FONTS.montserrat,
    fontSize: 13,
    color: COLORS.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  card: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 16,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    shadowColor: "#4A4A1E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.13,
    shadowRadius: 12,
    elevation: 4,
  },
  badgeWrap: { marginBottom: SPACING.xs },
  badge: {
    alignSelf: "flex-start",
    fontFamily: FONTS.montserratMedium,
    fontSize: 12,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: "hidden",
  },
  badgePending: { backgroundColor: "#ECE5D2", color: COLORS.primaryDark },
  badgeSuccess: { backgroundColor: "rgba(72, 130, 86, 0.14)", color: "#2f5d3a" },
  badgeDanger: { backgroundColor: "rgba(180, 60, 60, 0.12)", color: "#7d2f2f" },
  badgeNeutral: { backgroundColor: "rgba(0, 0, 0, 0.06)", color: COLORS.textSecondary },
  description: {
    fontFamily: FONTS.montserrat,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  cancelReason: {
    fontFamily: FONTS.montserrat,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.text,
    marginTop: SPACING.xs,
    padding: SPACING.sm,
    backgroundColor: "#ECE5D2",
    borderRadius: 10,
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
  videoCtaLayout: {
    alignSelf: "flex-start",
    marginTop: SPACING.sm,
  },
  cancelBtn: {
    alignSelf: "flex-start",
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: 14,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: SPACING.md,
    backgroundColor: "rgba(180, 60, 60, 0.06)",
  },
  cancelBtnPressed: { opacity: 0.82 },
  cancelText: { color: COLORS.error, fontFamily: FONTS.montserratMedium, fontSize: 14 },
  emptyCard: {
    alignItems: "center",
    backgroundColor: COLORS.cardBackground,
    borderRadius: 16,
    padding: SPACING.lg,
    shadowColor: "#4A4A1E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.13,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(99, 97, 40, 0.12)",
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    color: COLORS.text,
    fontFamily: FONTS.montserratBold,
    fontSize: 19,
    lineHeight: 25,
    textAlign: "center",
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: SPACING.xs,
  },
  catalogCta: {
    marginTop: SPACING.lg,
    alignSelf: "center",
  },
  muted: { fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.textSecondary },
  error: { color: COLORS.error, marginBottom: SPACING.md, fontFamily: FONTS.montserrat },
});
