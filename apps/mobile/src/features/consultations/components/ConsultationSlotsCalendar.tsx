import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
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
export function ConsultationSlotsCalendar({
  cynologistUserId,
  slotDurationMin,
  displayName,
}: ConsultationSlotsCalendarProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [selectedDayKey, setSelectedDayKey] = useState("");
  const [selectedMonthKey, setSelectedMonthKey] = useState("");
  const [verifyingSlotId, setVerifyingSlotId] = useState<string | null>(null);

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
    queryKey: ["consultations", "slotsCalendar", cynologistUserId, fromIso, toIso],
    queryFn: async () => {
      const res = await consultationsApi.getSlotsCalendar(cynologistUserId, fromIso, toIso);
      if (!res.success || !res.data) {
        if (isSubscriptionRequiredCode(res.code)) {
          openConsultationAccessPaywall();
          return { slots: EMPTY_SLOTS, dayOffDates: EMPTY_DAY_OFF_DATES, accessRequired: true };
        }
        throw new Error(res.error ?? "Ошибка загрузки слотов");
      }
      const raw = res.data.filter((s) => s.status !== "BLOCKED");
      const dayOffDates = Array.isArray(res.dayOffDates) ? res.dayOffDates : [];
      return {
        slots: raw, dayOffDates, accessRequired: false,
        bookingEligibility: res.bookingEligibility,
      };
    },
  });

  useFocusEffect(useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["consultations", "slotsCalendar", cynologistUserId] });
  }, [queryClient, cynologistUserId]));

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
      const qs = new URLSearchParams({
        cynologistUserId,
        slotId: slot.id,
        startAtUtc: slot.startAtUtc,
        endAtUtc: slot.endAtUtc,
        cynologistName: displayName ?? "",
      });
      router.push(`/consultations/booking-confirm?${qs.toString()}` as Href);
    },
    [cynologistUserId, displayName, router],
  );

  const verifyAndBook = useCallback(
    async (slot: ConsultationSlotDto) => {
      if (slot.status !== "FREE") return;
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
        if (res.success) {
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
          openConsultationAccessPaywall();
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
          await queryClient.invalidateQueries({
            queryKey: ["consultations", "slotsCalendar", cynologistUserId],
          });
          return;
        }
        Alert.alert("Не удалось проверить слот", res.error ?? "Попробуйте ещё раз.");
      } catch (e) {
        reportClientError(e instanceof Error ? e : new Error(String(e)), {
          issueKey: "consultation",
          keys: { screen: "slots", op: "verify" },
        });
        Alert.alert("Ошибка", "Не удалось проверить слот.");
      } finally {
        setVerifyingSlotId(null);
      }
    },
    [cynologistUserId, openConfirm, queryClient],
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
        <Text accessibilityRole="alert" style={{ fontFamily: FONTS.montserrat, fontSize: 16, lineHeight: 24 }}>
          {bookingEligibility.message}
        </Text>
        <Button label="Мои консультации" onPress={() => router.push("/consultations/mine" as Href)} />
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

      {slotsQuery.isLoading ? (
        <Loading message="Загрузка свободного времени…" />
      ) : null}
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
                      disabled={!isFree || isVerifying}
                      onPress={() => void verifyAndBook(slot)}
                      accessibilityLabel={
                        isFree
                          ? `Выбрать слот ${formatTimeMsk(start)} — ${formatTimeMsk(end)}`
                          : `Слот ${formatTimeMsk(start)} — ${formatTimeMsk(end)} недоступен`
                      }
                      accessibilityState={{ disabled: !isFree || isVerifying, busy: isVerifying }}
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
