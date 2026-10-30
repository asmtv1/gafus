import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getConsultationBookingStatusPresentation,
  type ConsultationBookingDto,
} from "@gafus/consultation-shared";
import { formatConsultationListDateTimeMsk } from "@gafus/consultation-shared";
import * as Linking from "expo-linking";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";

import { COLORS, FONTS, SPACING } from "@/shared/config";
import { Loading, TexturedSafeAreaView } from "@/shared/components";
import { Button } from "@/shared/components/ui";
import { consultationsApi } from "@/shared/lib/api";
import { consultationCancelGuarded } from "@/features/consultations";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { useAuthStore } from "@/shared/stores/authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import {
  uncertainBookingForOwner,
  bookingDurableNative,
  type BookingTombstoneRead,
} from "@/features/consultations";

/**
 * Мои бронирования — паритет с web (бейджи статусов, подсказка МСК).
 */
/** A new auth epoch gets its own cancellation intent and never inherits a previous flight. */
export default function ConsultationsMineScreen() {
  const user = useAuthStore((state) => state.user);
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = user && binding?.principalId === user.id ? binding.authEpoch : null;
  return <ActorConsultationsMineScreen key={`${user?.id ?? "guest"}:${epoch ?? "unverified"}`} />;
}

function ActorConsultationsMineScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const ownerProfile = useAuthStore((state) => state.user);
  const ownerId = ownerProfile?.id ?? null;
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const actorEpoch = ownerId && binding?.principalId === ownerId ? binding.authEpoch : null;
  const mounted = useRef(true);
  const cancelFlight = useRef(false);
  const cancelConfirm = useRef<string | null>(null);
  const cancelUnknown = useRef(false);
  const cancelCompleted = useRef(new Set<string>());
  const [cancelBusy, setCancelBusy] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const currentActor = () => {
    const latest = newOnlyV2NativeQueues.getVerifiedBinding();
    return (
      mounted.current &&
      !!ownerId &&
      !!actorEpoch &&
      useAuthStore.getState().user === ownerProfile &&
      latest?.principalId === ownerId &&
      latest.authEpoch === actorEpoch
    );
  };
  const [durable, setDurable] = useState<{
    ownerId: string;
    authEpoch: string;
    result: BookingTombstoneRead;
  } | null>(null);
  // Navigator may keep this screen mounted while booking-confirm changes the local receipt.
  // Re-attest on every focus, and invalidate in-flight reads on blur or actor rotation.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const epoch = binding?.principalId === ownerId ? binding.authEpoch : null;
      setDurable(null);
      if (ownerId && epoch && ownerProfile) {
        void bookingDurableNative.read(ownerId, epoch).then((state) => {
          const current = newOnlyV2NativeQueues.getVerifiedBinding();
          if (
            !cancelled &&
            useAuthStore.getState().user === ownerProfile &&
            current?.principalId === ownerId &&
            current.authEpoch === epoch
          )
            setDurable({ ownerId, authEpoch: epoch, result: state });
        });
      }
      return () => {
        cancelled = true;
      };
    }, [ownerId, ownerProfile, binding?.authEpoch, binding?.principalId]),
  );
  // Never paint A/E1's last read under the same account's E2 or a foreign owner.
  const visibleDurable =
    binding?.principalId === ownerId &&
    durable?.ownerId === ownerId &&
    durable.authEpoch === binding.authEpoch
      ? durable.result
      : null;
  const hasDurableUnknown =
    visibleDurable?.status === "UNKNOWN" || visibleDurable?.status === "EXPIRED";
  const hasUnknownBooking =
    !!ownerId &&
    binding?.principalId === ownerId &&
    uncertainBookingForOwner(ownerId, binding.authEpoch);
  const ownerBindingUnavailable = !!ownerId && binding?.principalId !== ownerId;
  const isCheckingLocalReceipt =
    !!ownerId && binding?.principalId === ownerId && visibleDurable === null;
  const mayOfferNewBooking =
    !ownerBindingUnavailable &&
    !isCheckingLocalReceipt &&
    !hasDurableUnknown &&
    visibleDurable?.status !== "UNAVAILABLE" &&
    !hasUnknownBooking;

  const query = useQuery({
    queryKey: ["consultations", "mine", ownerId, actorEpoch],
    enabled: !!actorEpoch && !!ownerId,
    queryFn: async () => {
      if (!currentActor()) throw new Error("CONSULTATION_MINE_SESSION_CHANGED");
      const res = await consultationsApi.myBookings();
      if (!currentActor()) throw new Error("CONSULTATION_MINE_SESSION_CHANGED");
      if (!res.success) throw new Error("CONSULTATION_MINE_READ_UNCONFIRMED");
      return res.data ?? { items: [], nextCursor: null };
    },
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  /** Only an authenticated server /my row in an unchanged owner epoch may be cancelled. */
  const liveBooking = (bookingId: string) =>
    queryClient
      .getQueryData<{
        items: ConsultationBookingDto[];
      }>(["consultations", "mine", ownerId, actorEpoch])
      ?.items.find((b) => b.id === bookingId);
  const canCancelBooking = (bookingId: string, trainerId: string, slotId: string) => {
    const booking = liveBooking(bookingId);
    return (
      currentActor() &&
      !!booking &&
      booking.cynologistUserId === trainerId &&
      booking.slot.id === slotId &&
      canCancel(booking.status)
    );
  };
  const requestCancel = (bookingId: string, trainerId: string, slotId: string) => {
    if (
      cancelFlight.current ||
      cancelConfirm.current ||
      cancelUnknown.current ||
      cancelCompleted.current.has(bookingId) ||
      !canCancelBooking(bookingId, trainerId, slotId)
    )
      return;
    cancelConfirm.current = bookingId;
    hapticFeedback.medium();
    Alert.alert("Отменить запись?", "Запись будет отменена, а время снова станет доступно.", [
      {
        text: "Не отменять",
        style: "cancel",
        onPress: () => {
          cancelConfirm.current = null;
        },
      },
      {
        text: "Отменить",
        style: "destructive",
        onPress: () => {
          if (cancelConfirm.current !== bookingId) return;
          cancelConfirm.current = null;
          if (
            cancelFlight.current ||
            cancelUnknown.current ||
            cancelCompleted.current.has(bookingId) ||
            !canCancelBooking(bookingId, trainerId, slotId)
          )
            return;
          cancelFlight.current = true;
          setCancelBusy(true);
          void (async () => {
            try {
              const res = await consultationCancelGuarded(bookingId, () =>
                canCancelBooking(bookingId, trainerId, slotId),
              );
              if (!currentActor()) return;
              if (!res.success) {
                cancelUnknown.current = true;
                if (
                  res.code === "CONSULTATION_SLOT_TAKEN" ||
                  res.code === "CONSULTATION_IDEMPOTENCY_CONFLICT" ||
                  res.code === "CONSULTATION_FORBIDDEN" ||
                  res.code === "CONSULTATION_NOT_FOUND"
                ) {
                  Alert.alert(
                    "Запись изменилась",
                    "Состояние записи изменилось. Проверьте актуальный статус перед новой попыткой.",
                  );
                } else {
                  throw new Error("CONSULTATION_CANCEL_RESULT_UNCONFIRMED");
                }
                return;
              }
              if (res.data?.bookingId !== bookingId) {
                throw new Error("CONSULTATION_CANCEL_ACK_MISMATCH");
              }
              // A committed cancellation blocks only this booking, not another server row.
              cancelCompleted.current.add(bookingId);
              try {
                await queryClient.invalidateQueries({
                  queryKey: ["consultations", "mine", ownerId, actorEpoch],
                });
              } catch {
                if (currentActor())
                  reportClientError(new Error("CONSULTATION_CANCEL_CACHE_FAILED"), {
                    issueKey: "consultation",
                    keys: { screen: "mine", op: "cancel_cache" },
                  });
              }
            } catch {
              if (!currentActor()) return;
              cancelUnknown.current = true;
              reportClientError(new Error("CONSULTATION_CANCEL_RESULT_UNCONFIRMED"), {
                issueKey: "consultation",
                keys: { screen: "mine", op: "cancel" },
              });
              Alert.alert(
                "Отмена записи",
                "Результат отмены неизвестен. Проверьте запись, прежде чем повторять действие.",
              );
            } finally {
              cancelFlight.current = false;
              if (currentActor()) setCancelBusy(false);
            }
          })();
        },
      },
    ]);
  };

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

          {ownerBindingUnavailable ||
          isCheckingLocalReceipt ||
          hasDurableUnknown ||
          visibleDurable?.status === "UNAVAILABLE" ||
          hasUnknownBooking ? (
            <View style={styles.emptyCard}>
              <Text accessibilityRole="alert" style={styles.emptyText}>
                {ownerBindingUnavailable
                  ? "Не удалось проверить защищённую сессию. Не отправляйте повторную заявку до восстановления доступа."
                  : isCheckingLocalReceipt
                    ? "Проверяем локальное состояние записи. До окончания проверки не отправляйте новую заявку."
                    : visibleDurable?.status === "EXPIRED"
                      ? "С момента неподтверждённой записи прошло более 24 часов. Срок квитанции мог истечь, но это не доказывает отсутствие брони. Проверьте запись вручную или обратитесь в поддержку."
                      : visibleDurable?.status === "UNAVAILABLE"
                        ? "Не удалось проверить локальное состояние записи. Даже пустой список не доказывает отсутствие брони. При необходимости обратитесь в поддержку."
                        : "Найдена неподтверждённая запись. Сервер мог создать бронь. Даже пустой список не доказывает отсутствие брони. Перед повторной попыткой обратитесь в поддержку."}
              </Text>
            </View>
          ) : null}
          {query.isLoading ? (
            <Loading variant="inline" message="Загружаем ваши консультации…" />
          ) : null}
          {query.isError ? <Text style={styles.error}>Не удалось загрузить записи.</Text> : null}
          {mayOfferNewBooking && items.length === 0 && !query.isLoading && !query.isError ? (
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
                Выберите кинолога в каталоге и забронируйте удобное время для консультации. Если вы
                недавно отправляли заявку, но не получили подтверждения, пустой список не
                доказывает, что запись отсутствует. Проверьте её через поддержку перед повтором.
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
                    onPress={() =>
                      void Linking.openURL(
                        `https://gafus.ru/consultations/call/${encodeURIComponent(b.id)}`,
                      )
                    }
                    accessibilityRole="link"
                    accessibilityLabel="Перейти к видеовстрече"
                  />
                ) : null}
                {canCancel(b.status) ? (
                  <Pressable
                    style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
                    disabled={
                      cancelBusy ||
                      cancelFlight.current ||
                      cancelUnknown.current ||
                      cancelCompleted.current.has(b.id) ||
                      !currentActor()
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Отменить запись ${b.id}`}
                    onPress={() => requestCancel(b.id, b.cynologistUserId, b.slot.id)}
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
