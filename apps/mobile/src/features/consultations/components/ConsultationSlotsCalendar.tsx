import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  consultationBookingCalendarWindowMsk,
  consultationMskDayKeyToDate,
  consultationCalendarMonthKeyFromDayKey as toMonthKeyFromDayKey,
  formatConsultationDayLabelMsk as formatDayLabel,
  formatConsultationTimeMsk as formatTimeMsk,
  consultationCalendarMonthKey as toMonthKey,
  consultationMskDayKey as toDayKey,
} from "@gafus/consultation-shared";
import {
  buildConsultationCalendarRangeDays,
  filterConsultationSlotsExcludingDayOffs,
  groupConsultationSlotsByMskDay,
} from "@gafus/consultation-shared";
import type { ConsultationSlotDto } from "@gafus/consultation-shared";
import type { Href } from "expo-router";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";

import { COLORS, FONTS, SPACING } from "@/shared/config";
import { Button, Loading } from "@/shared/components/ui";
import { consultationsApi, isSubscriptionRequiredCode } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { trackEvent } from "@/shared/lib/analytics";
import { useAuthStore } from "@/shared/stores/authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import {
  openConsultationAccessPaywall,
  showConsultationBookingNotIncludedAlert,
} from "../lib/consultationAccessPaywall";

interface ConsultationSlotsCalendarProps {
  cynologistUserId: string;
  slotDurationMin: number;
  displayName?: string;
}

const EMPTY_SLOTS: ConsultationSlotDto[] = [];
const EMPTY_DAY_OFF_DATES: string[] = [];

function formatCalendarMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function slotStatusLabel(status: string): string {
  if (status === "BOOKED") return "Занято";
  if (status === "BLOCKED") return "Недоступно";
  return "Свободно";
}

/**
 * Календарь слотов и выбор времени — паритет с web (CynologistSlotsClient).
 */
type CalendarActor = { ownerId: string; authEpoch: string };

/** One trainer-calendar instance per verified native actor and epoch. */
export function ConsultationSlotsCalendar(props: ConsultationSlotsCalendarProps) {
  const ownerId = useAuthStore((state) =>
    state.isAuthenticated && !state.isLoading ? state.user?.id : null,
  );
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const actor: CalendarActor | null =
    ownerId && binding?.principalId === ownerId && binding.authEpoch
      ? { ownerId, authEpoch: binding.authEpoch }
      : null;
  return (
    <ActorSlotsCalendar
      key={`${props.cynologistUserId}:${actor?.ownerId ?? "guest"}:${actor?.authEpoch ?? "unverified"}`}
      {...props}
      actor={actor}
    />
  );
}

function ActorSlotsCalendar({
  cynologistUserId,
  slotDurationMin,
  displayName,
  actor,
}: ConsultationSlotsCalendarProps & { actor: CalendarActor | null }) {
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [selectedDayKey, setSelectedDayKey] = useState("");
  const [selectedMonthKey, setSelectedMonthKey] = useState("");
  const [verifyingSlotId, setVerifyingSlotId] = useState<string | null>(null);
  const actorOwnerId = actor?.ownerId;
  const actorEpoch = actor?.authEpoch;
  const mounted = useRef(true);
  const flight = useRef(false);
  const unknown = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const currentActor = useCallback(() => {
    const state = useAuthStore.getState();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    return (
      mounted.current &&
      !!actorOwnerId &&
      !!actorEpoch &&
      !!cynologistUserId &&
      state.isAuthenticated &&
      !state.isLoading &&
      state.user?.id === actorOwnerId &&
      binding?.principalId === actorOwnerId &&
      binding.authEpoch === actorEpoch
    );
  }, [actorOwnerId, actorEpoch, cynologistUserId]);

  const { fromDate, toDate, fromIso, toIso } = useMemo(() => {
    const window = consultationBookingCalendarWindowMsk(14);
    return {
      fromDate: consultationMskDayKeyToDate(window.fromKey),
      toDate: consultationMskDayKeyToDate(window.toKey),
      fromIso: window.fromUtc.toISOString(),
      toIso: window.toUtc.toISOString(),
    };
  }, []);

  const slotsQuery = useQuery({
    refetchInterval: 60_000,
    staleTime: 0,
    queryKey: [
      "consultations",
      "slotsCalendar",
      cynologistUserId,
      actor?.ownerId,
      actor?.authEpoch,
      fromIso,
      toIso,
    ],
    enabled: actor !== null && !!cynologistUserId,
    retry: false,
    queryFn: async () => {
      if (!currentActor()) throw new Error("CONSULTATION_CALENDAR_SESSION_CHANGED");
      const res = await consultationsApi.getSlotsCalendar(cynologistUserId, fromIso, toIso);
      if (!currentActor()) throw new Error("CONSULTATION_CALENDAR_SESSION_CHANGED");
      if (!res.success || !res.data) {
        if (isSubscriptionRequiredCode(res.code)) {
          openConsultationAccessPaywall();
          return { slots: EMPTY_SLOTS, dayOffDates: EMPTY_DAY_OFF_DATES, accessRequired: true };
        }
        throw new Error("CONSULTATION_CALENDAR_READ_UNKNOWN");
      }
      const raw = res.data.filter((s) => s.status !== "BLOCKED");
      const dayOffDates = Array.isArray(res.dayOffDates) ? res.dayOffDates : [];
      return {
        slots: raw,
        dayOffDates,
        accessRequired: false,
        bookingEligibility: res.bookingEligibility,
      };
    },
  });

  useFocusEffect(
    useCallback(() => {
      if (!currentActor()) return;
      void queryClient.invalidateQueries({
        queryKey: [
          "consultations",
          "slotsCalendar",
          cynologistUserId,
          actor?.ownerId,
          actor?.authEpoch,
        ],
      });
    }, [queryClient, cynologistUserId, actor?.ownerId, actor?.authEpoch, currentActor]),
  );

  const slots = slotsQuery.data?.slots ?? EMPTY_SLOTS;
  const dayOffDates = slotsQuery.data?.dayOffDates ?? EMPTY_DAY_OFF_DATES;
  const dayOffSet = useMemo(() => new Set(dayOffDates), [dayOffDates]);

  const rangeDays = useMemo(
    () => buildConsultationCalendarRangeDays(fromDate, toDate),
    [fromDate, toDate],
  );

  const rangeDaySet = useMemo(() => new Set(rangeDays.map((d) => toDayKey(d))), [rangeDays]);

  const visibleSlots = useMemo(
    () => filterConsultationSlotsExcludingDayOffs(slots, dayOffSet),
    [dayOffSet, slots],
  );

  const slotsByDay = useMemo(() => groupConsultationSlotsByMskDay(visibleSlots), [visibleSlots]);

  const slotsByDayMap = useMemo(() => {
    return new Map(slotsByDay.map((d) => [d.dateKey, d.slots]));
  }, [slotsByDay]);

  const monthKeys = useMemo(() => {
    return Array.from(new Set(rangeDays.map((d) => toMonthKey(d))));
  }, [rangeDays]);

  useEffect(() => {
    if (rangeDays.length === 0) return;
    const firstDay = toDayKey(rangeDays[0]);
    const initialDay = slotsByDay[0]?.dateKey ?? firstDay;
    setSelectedDayKey((prev) => prev || initialDay);
    setSelectedMonthKey((prev) => prev || toMonthKeyFromDayKey(initialDay));
  }, [rangeDays, slotsByDay]);

  const currentMonthDate = useMemo(() => {
    if (!selectedMonthKey) return null;
    const [y, m] = selectedMonthKey.split("-").map(Number);
    if (!y || !m) return null;
    return new Date(y, m - 1, 1);
  }, [selectedMonthKey]);

  const monthCells = useMemo(() => {
    if (!selectedMonthKey) return [];
    const [year, month] = selectedMonthKey.split("-").map(Number);
    if (!year || !month) return [];
    const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < firstWeekday; i += 1) {
      out.push(null);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      out.push(`${selectedMonthKey}-${String(day).padStart(2, "0")}`);
    }
    return out;
  }, [selectedMonthKey]);

  const selectedDaySlots = useMemo(() => {
    return slotsByDayMap.get(selectedDayKey) ?? [];
  }, [selectedDayKey, slotsByDayMap]);

  const selectedDayDate = useMemo(() => {
    if (!selectedDayKey) return null;
    return new Date(`${selectedDayKey}T12:00:00.000Z`);
  }, [selectedDayKey]);

  const selectedMonthIndex = monthKeys.indexOf(selectedMonthKey);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: displayName?.trim() ? displayName : "Запись",
    });
  }, [navigation, displayName]);

  const openConfirm = useCallback(
    (slot: ConsultationSlotDto) => {
      if (!currentActor()) return;
      const qs = new URLSearchParams({
        cynologistUserId,
        slotId: slot.id,
        startAtUtc: slot.startAtUtc,
        endAtUtc: slot.endAtUtc,
        cynologistName: displayName ?? "",
      });
      router.push(`/consultations/booking-confirm?${qs.toString()}` as Href);
    },
    [cynologistUserId, displayName, router, currentActor],
  );

  const verifyAndBook = useCallback(
    async (slot: ConsultationSlotDto) => {
      if (
        !currentActor() ||
        flight.current ||
        unknown.current ||
        slot.status !== "FREE" ||
        slotsQuery.data?.bookingEligibility?.canBook === false ||
        !visibleSlots.some((item) => item.id === slot.id && item.status === "FREE")
      )
        return;
      flight.current = true;
      hapticFeedback.medium();
      trackEvent({
        eventName: "button_click",
        platform: "mobile",
        pathOrScreen: `/consultations/${cynologistUserId}`,
        elementId: "consultation-slot-select",
      });
      setVerifyingSlotId(slot.id);
      try {
        const res = await consultationsApi.verifySlotFree(cynologistUserId, slot.id);
        if (!currentActor()) return;
        // Existing Hono GET /verify ACK is {success:true} with no data payload.
        if (res.success === true) {
          trackEvent({
            eventName: "button_click",
            platform: "mobile",
            pathOrScreen: `/consultations/${cynologistUserId}`,
            elementId: "consultation-booking-confirm-open",
          });
          openConfirm(slot);
          return;
        }
        if (isSubscriptionRequiredCode(res.code)) {
          if (currentActor()) openConsultationAccessPaywall();
          return;
        }
        if (res.code === "CONSULTATION_BOOKING_NOT_INCLUDED") {
          showConsultationBookingNotIncludedAlert();
          return;
        }
        if (
          res.code === "CONSULTATION_SLOT_TAKEN" ||
          res.code === "CONSULTATION_NOT_FOUND" ||
          res.error?.toLowerCase().includes("занят")
        ) {
          Alert.alert("Слот занят", "Извините, этот слот уже занят. Выберите другое время.");
          try {
            await queryClient.invalidateQueries({
              queryKey: [
                "consultations",
                "slotsCalendar",
                cynologistUserId,
                actor?.ownerId,
                actor?.authEpoch,
              ],
            });
          } catch {
            if (currentActor())
              reportClientError(new Error("CONSULTATION_CALENDAR_REFRESH_FAILED"), {
                issueKey: "consultation",
                keys: { screen: "slots", op: "refresh" },
              });
          }
          return;
        }
        unknown.current = true;
        Alert.alert(
          "Не удалось проверить слот",
          "Результат проверки неизвестен. Обновите календарь перед новой попыткой.",
        );
      } catch {
        if (!currentActor()) return;
        unknown.current = true;
        reportClientError(new Error("CONSULTATION_SLOT_VERIFY_UNCONFIRMED"), {
          issueKey: "consultation",
          keys: { screen: "slots", op: "verify" },
        });
        Alert.alert("Ошибка", "Результат проверки слота неизвестен.");
      } finally {
        flight.current = false;
        if (currentActor()) setVerifyingSlotId(null);
      }
    },
    [
      cynologistUserId,
      openConfirm,
      queryClient,
      slotsQuery.data,
      visibleSlots,
      actor?.ownerId,
      actor?.authEpoch,
      currentActor,
    ],
  );

  useEffect(() => {
    if (slotsQuery.isError && slotsQuery.error) {
      reportClientError(
        slotsQuery.error instanceof Error ? slotsQuery.error : new Error(String(slotsQuery.error)),
        { issueKey: "consultation", keys: { screen: "slotsCalendar" } },
      );
    }
  }, [slotsQuery.isError, slotsQuery.error]);

  const bookingEligibility = slotsQuery.data?.bookingEligibility;
  if (!slotsQuery.isPending && bookingEligibility && !bookingEligibility.canBook) {
    return (
      <ScrollView contentContainerStyle={{ padding: SPACING.md, gap: SPACING.md }}>
        <Text
          accessibilityRole="alert"
          style={{ fontFamily: FONTS.montserrat, fontSize: 16, lineHeight: 24 }}
        >
          {bookingEligibility.message}
        </Text>
        <Button
          label="Мои консультации"
          onPress={() => router.push("/consultations/mine" as Href)}
        />
        <Button label="Обновить" onPress={() => void slotsQuery.refetch()} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.topMeta}>
        <Text style={styles.metaPill}>Часовой пояс: МСК (UTC+3)</Text>
        <Text style={styles.metaPill}>Длительность консультации: до {slotDurationMin} мин</Text>
      </View>

      {slotsQuery.isLoading ? <Loading message="Загрузка свободного времени…" /> : null}
      {slotsQuery.isError ? <Text style={styles.error}>Не удалось загрузить слоты.</Text> : null}

      {slotsQuery.data?.accessRequired ? (
        <View style={styles.accessRequired}>
          <Text style={styles.accessRequiredTitle}>Для просмотра слотов нужна подписка</Text>
          <Text style={styles.accessRequiredText}>
            Выберите подходящий тариф, чтобы посмотреть свободное время кинолога.
          </Text>
          <Button
            label="Выбрать тариф"
            fullWidth={false}
            height={44}
            fontFamily={FONTS.montserratMedium}
            fontSize={14}
            lineHeight={18}
            horizontalPadding={SPACING.md}
            verticalPadding={0}
            borderRadius={14}
            animatedPress
            style={styles.accessRequiredButtonLayout}
            onPress={openConsultationAccessPaywall}
          />
        </View>
      ) : null}

      {!slotsQuery.isLoading && !slotsQuery.isError && !slotsQuery.data?.accessRequired ? (
        <View style={styles.layout}>
          <View style={styles.calendarPanel}>
            <View style={styles.calendarHeader}>
              <Pressable
                style={styles.monthNavBtn}
                disabled={selectedMonthIndex <= 0}
                onPress={() => {
                  if (selectedMonthIndex > 0) {
                    setSelectedMonthKey(monthKeys[selectedMonthIndex - 1] ?? selectedMonthKey);
                  }
                }}
              >
                <Text style={styles.monthNavText}>{"<"}</Text>
              </Pressable>
              <Text style={styles.calendarMonth}>
                {currentMonthDate ? formatCalendarMonthLabel(currentMonthDate) : ""}
              </Text>
              <Pressable
                style={styles.monthNavBtn}
                disabled={selectedMonthIndex < 0 || selectedMonthIndex >= monthKeys.length - 1}
                onPress={() => {
                  if (selectedMonthIndex >= 0 && selectedMonthIndex < monthKeys.length - 1) {
                    setSelectedMonthKey(monthKeys[selectedMonthIndex + 1] ?? selectedMonthKey);
                  }
                }}
              >
                <Text style={styles.monthNavText}>{">"}</Text>
              </Pressable>
            </View>
            <View style={styles.weekdays}>
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((w) => (
                <Text key={w} style={styles.weekdayCell}>
                  {w}
                </Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {monthCells.map((dayKey, idx) => {
                if (!dayKey) {
                  return <View key={`empty-${idx}`} style={styles.emptyCell} />;
                }
                const inRange = rangeDaySet.has(dayKey);
                const dayDate = consultationMskDayKeyToDate(dayKey);
                const isWeekend = dayDate.getUTCDay() === 0 || dayDate.getUTCDay() === 6;
                const isSelected = selectedDayKey === dayKey;
                const daySlots = slotsByDayMap.get(dayKey) ?? [];
                const freeCount = daySlots.filter((s) => s.status === "FREE").length;
                const isDayOff = dayOffSet.has(dayKey);
                const hasNoFreeSlots = inRange && freeCount === 0;

                return (
                  <Pressable
                    key={dayKey}
                    style={[
                      styles.dayCell,
                      isWeekend && styles.dayCellWeekend,
                      isSelected && styles.dayCellSelected,
                      !inRange && styles.dayCellOut,
                    ]}
                    disabled={!inRange}
                    onPress={() => {
                      trackEvent({
                        eventName: "button_click",
                        platform: "mobile",
                        pathOrScreen: `/consultations/${cynologistUserId}`,
                        elementId: "consultation-day-select",
                      });
                      setSelectedDayKey(dayKey);
                    }}
                  >
                    <Text style={styles.dayNumber}>{dayDate.getUTCDate()}</Text>
                    <Text style={styles.dayCount} numberOfLines={1}>
                      {inRange ? (isDayOff ? "0 св." : `${freeCount} св.`) : ""}
                    </Text>
                    {hasNoFreeSlots && !isDayOff ? <View style={styles.noFreeDot} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.slotsPanel}>
            <Text style={styles.slotsTitle}>
              {selectedDayDate ? formatDayLabel(selectedDayDate) : "Слоты"}
            </Text>
            {selectedDaySlots.length === 0 ? (
              <Text style={styles.emptyDay}>На выбранный день слотов нет.</Text>
            ) : (
              selectedDaySlots.map((slot) => {
                const start = new Date(slot.startAtUtc);
                const end = new Date(slot.endAtUtc);
                const isFree = slot.status === "FREE";
                const isVerifying = verifyingSlotId === slot.id;
                return (
                  <View key={slot.id} style={styles.slotRow}>
                    <View style={styles.slotTextCol}>
                      <Text style={styles.slotTime}>
                        {formatTimeMsk(start)} — {formatTimeMsk(end)}
                      </Text>
                      <Text style={styles.slotStatus}>{slotStatusLabel(slot.status)}</Text>
                    </View>
                    <Button
                      label={isFree ? (isVerifying ? "Проверяем…" : "Выбрать слот") : "Недоступно"}
                      width={140}
                      fullWidth={false}
                      height={44}
                      fontFamily={FONTS.montserratMedium}
                      fontSize={13}
                      lineHeight={18}
                      horizontalPadding={SPACING.sm}
                      verticalPadding={0}
                      borderRadius={14}
                      animatedPress
                      haptic={false}
                      loading={isVerifying}
                      disabled={
                        !isFree ||
                        isVerifying ||
                        flight.current ||
                        unknown.current ||
                        !currentActor()
                      }
                      onPress={() => void verifyAndBook(slot)}
                      accessibilityLabel={
                        isFree
                          ? `Выбрать слот ${formatTimeMsk(start)} — ${formatTimeMsk(end)}`
                          : `Слот ${formatTimeMsk(start)} — ${formatTimeMsk(end)} недоступен`
                      }
                      accessibilityState={{
                        disabled:
                          !isFree ||
                          isVerifying ||
                          flight.current ||
                          unknown.current ||
                          !currentActor(),
                        busy: isVerifying,
                      }}
                    />
                  </View>
                );
              })
            )}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xl },
  topMeta: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginBottom: SPACING.md },
  metaPill: {
    fontFamily: FONTS.montserrat,
    fontSize: 12,
    color: COLORS.textSecondary,
    backgroundColor: "#ECE5D2",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
  },
  error: { color: COLORS.error, marginBottom: SPACING.md, fontFamily: FONTS.montserrat },
  accessRequired: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    alignItems: "flex-start",
    gap: SPACING.sm,
  },
  accessRequiredTitle: {
    color: COLORS.text,
    fontFamily: FONTS.montserratMedium,
    fontSize: 16,
  },
  accessRequiredText: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
    fontSize: 14,
  },
  accessRequiredButtonLayout: {
    marginTop: SPACING.xs,
  },
  layout: { gap: SPACING.lg },
  calendarPanel: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#D4C4A8",
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  monthNavBtn: { padding: SPACING.sm },
  monthNavText: { fontSize: 18, color: COLORS.primary, fontFamily: FONTS.montserratMedium },
  calendarMonth: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 16,
    color: COLORS.text,
    textTransform: "capitalize",
  },
  weekdays: {
    flexDirection: "row",
    marginBottom: SPACING.xs,
  },
  weekdayCell: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  emptyCell: { width: `${100 / 7}%`, aspectRatio: 1, maxWidth: 52 },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    maxWidth: 52,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
    borderWidth: 1,
    borderColor: "transparent",
  },
  dayCellWeekend: { backgroundColor: "#ECE5D2" },
  dayCellSelected: {
    borderColor: COLORS.primary,
    backgroundColor: "#ECE5D2",
  },
  dayCellOut: { opacity: 0.35 },
  dayNumber: { fontFamily: FONTS.montserratMedium, fontSize: 14, color: COLORS.text },
  dayCount: { fontSize: 9, color: COLORS.textSecondary, fontFamily: FONTS.montserrat },
  noFreeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.textSecondary,
    marginTop: 2,
  },
  slotsPanel: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#D4C4A8",
  },
  slotsTitle: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textTransform: "capitalize",
  },
  emptyDay: { fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.textSecondary },
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: SPACING.sm,
  },
  slotTextCol: { flex: 1 },
  slotTime: { fontFamily: FONTS.montserratMedium, fontSize: 15, color: COLORS.text },
  slotStatus: {
    fontFamily: FONTS.montserrat,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
