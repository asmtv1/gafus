"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type MouseEvent,
} from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { trackEvent } from "@gafus/analytics";

import {
  buildConsultationCalendarRangeDays,
  filterConsultationSlotsExcludingDayOffs,
  groupConsultationSlotsByMskDay,
  consultationBookingCalendarWindowMsk,
  consultationCalendarMonthKey as toMonthKey,
  consultationCalendarMonthKeyFromDayKey as toMonthKeyFromDayKey,
  consultationMskDayKey as toDayKey,
  consultationMskDayKeyToDate,
  formatConsultationDayLabelMsk as formatDayLabel,
  formatConsultationTimeMsk as formatTime,
  type ConsultationSlotDto,
  type ConsultationSlotsByDay,
  type ListedCynologistCardDto,
} from "@gafus/consultation-shared";
import { reportClientError } from "@gafus/error-handling";

import { AppSubscriptionPaywall } from "@/features/app-subscription/components/AppSubscriptionPaywall";
import { showErrorAlert } from "@shared/utils/sweetAlert";

import styles from "./cynologist-slots-client.module.css";

interface CynologistSlotsClientProps {
  cynologist: ListedCynologistCardDto;
}

interface SlotsResponse {
  success?: boolean;
  data?: ConsultationSlotDto[];
  dayOffDates?: string[];
  error?: string;
}

function formatCalendarMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(date);
}

/**
 * Загрузка свободных слотов и бронирование с Idempotency-Key и CSRF.
 */
export function CynologistSlotsClient({ cynologist }: CynologistSlotsClientProps) {
  const router = useRouter();
  const pathname = usePathname() ?? `/consultations/${cynologist.userId}`;
  const [slots, setSlots] = useState<ConsultationSlotDto[]>([]);
  const [dayOffDates, setDayOffDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending] = useTransition();
  const [verifyingSlotId, setVerifyingSlotId] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [selectedDayKey, setSelectedDayKey] = useState<string>("");
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>("");

  const { fromDate, toDate, fromIso, toIso } = useMemo(() => {
    const window = consultationBookingCalendarWindowMsk(14);
    return {
      fromDate: consultationMskDayKeyToDate(window.fromKey),
      toDate: consultationMskDayKeyToDate(window.toKey),
      fromIso: window.fromUtc.toISOString(),
      toIso: window.toUtc.toISOString(),
    };
  }, []);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from: fromIso, to: toIso, includeBusy: "1" });
      const res = await fetch(
        `/api/v1/consultations/cynologists/${encodeURIComponent(cynologist.userId)}/slots?${qs}`,
        { credentials: "include" },
      );
      const json = (await res.json()) as SlotsResponse;
      if (res.status === 402) {
        setPaywallOpen(true);
        setSlots([]);
        setDayOffDates([]);
        return;
      }
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? "Не удалось загрузить слоты");
        setSlots([]);
        setDayOffDates([]);
        return;
      }
      setSlots(json.data.filter((slot) => slot.status !== "BLOCKED"));
      setDayOffDates(Array.isArray(json.dayOffDates) ? json.dayOffDates : []);
      setPaywallOpen(false);
      trackEvent({
        eventName: "button_click",
        platform: "web",
        pathOrScreen: pathname,
        elementId: "consultation-slots-loaded",
      });
    } catch (e) {
      reportClientError(e instanceof Error ? e : new Error(String(e)), {
        issueKey: "consultation",
        keys: { operation: "loadSlots" },
      });
      setError("Ошибка загрузки");
      setDayOffDates([]);
    } finally {
      setLoading(false);
    }
  }, [cynologist.userId, fromIso, pathname, toIso]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const rangeDays = useMemo(
    () => buildConsultationCalendarRangeDays(fromDate, toDate),
    [fromDate, toDate],
  );

  const rangeDaySet = useMemo(() => {
    return new Set(rangeDays.map((d) => toDayKey(d)));
  }, [rangeDays]);

  const dayOffSet = useMemo(() => new Set(dayOffDates), [dayOffDates]);

  const visibleSlots = useMemo(
    () => filterConsultationSlotsExcludingDayOffs(slots, dayOffSet),
    [dayOffSet, slots],
  );

  const slotsByDay = useMemo<ConsultationSlotsByDay[]>(
    () => groupConsultationSlotsByMskDay(visibleSlots),
    [visibleSlots],
  );

  const slotsByDayMap = useMemo(() => {
    return new Map(slotsByDay.map((d) => [d.dateKey, d.slots]));
  }, [slotsByDay]);

  const monthKeys = useMemo(() => {
    return Array.from(new Set(rangeDays.map((d) => toMonthKey(d))));
  }, [rangeDays]);

  useEffect(() => {
    if (rangeDays.length === 0) {
      return;
    }
    const firstDay = toDayKey(rangeDays[0]);
    const initialDay = slotsByDay[0]?.dateKey ?? firstDay;
    setSelectedDayKey((prev) => prev || initialDay);
    setSelectedMonthKey((prev) => prev || toMonthKeyFromDayKey(initialDay));
  }, [rangeDays, slotsByDay]);

  const currentMonthDate = useMemo(() => {
    if (!selectedMonthKey) {
      return null;
    }
    const [y, m] = selectedMonthKey.split("-").map(Number);
    if (!y || !m) {
      return null;
    }
    return new Date(y, m - 1, 1);
  }, [selectedMonthKey]);

  const monthCells = useMemo(() => {
    if (!selectedMonthKey) {
      return [];
    }
    const [year, month] = selectedMonthKey.split("-").map(Number);
    if (!year || !month) {
      return [];
    }
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
    if (!selectedDayKey) {
      return null;
    }
    return new Date(`${selectedDayKey}T12:00:00.000Z`);
  }, [selectedDayKey]);

  const selectedMonthIndex = monthKeys.indexOf(selectedMonthKey);

  const handleCalendarGridClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-consultation-day-key]",
      );
      if (!btn || !e.currentTarget.contains(btn) || btn.disabled) {
        return;
      }
      const dayKey = btn.getAttribute("data-consultation-day-key");
      if (!dayKey) {
        return;
      }
      trackEvent({
        eventName: "button_click",
        platform: "web",
        pathOrScreen: pathname,
        elementId: "consultation-day-select",
      });
      setSelectedDayKey(dayKey);
    },
    [pathname],
  );

  const openConfirm = useCallback(
    (slotId: string, startAtUtc: string, endAtUtc: string) => {
      setError(null);
      try {
        trackEvent({
          eventName: "button_click",
          platform: "web",
          pathOrScreen: pathname,
          elementId: "consultation-open-confirm",
        });
        trackEvent({
          eventName: "booking_start",
          platform: "web",
          pathOrScreen: pathname,
        });
        const params = new URLSearchParams({ slotId, startAtUtc, endAtUtc });
        router.push(`/consultations/${encodeURIComponent(cynologist.userId)}/confirm?${params}`);
      } catch (e) {
        reportClientError(e instanceof Error ? e : new Error(String(e)), {
          issueKey: "consultation",
          keys: { operation: "openConfirm" },
        });
        setError("Не удалось открыть подтверждение");
      }
    },
    [cynologist.userId, pathname, router],
  );

  const verifyAndBook = useCallback(
    async (slotId: string, startAtUtc: string, endAtUtc: string) => {
      trackEvent({
        eventName: "button_click",
        platform: "web",
        pathOrScreen: pathname,
        elementId: "consultation-slot-select",
      });
      setVerifyingSlotId(slotId);
      setError(null);
      try {
        const res = await fetch(
          `/api/v1/consultations/cynologists/${encodeURIComponent(cynologist.userId)}/slots/${encodeURIComponent(slotId)}/verify`,
          { credentials: "include", method: "GET" },
        );
        if (res.ok) {
          openConfirm(slotId, startAtUtc, endAtUtc);
          return;
        }
        if (res.status === 409 || res.status === 404) {
          void showErrorAlert("извините, этот слот уже занят");
          await loadSlots();
          return;
        }
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? "Не удалось проверить слот");
      } catch (e) {
        reportClientError(e instanceof Error ? e : new Error(String(e)), {
          issueKey: "consultation",
          keys: { operation: "verifySlot" },
        });
        setError("Ошибка проверки слота");
      } finally {
        setVerifyingSlotId(null);
      }
    },
    [cynologist.userId, loadSlots, openConfirm, pathname],
  );

  return (
    <Box className={styles.container}>
      <div className={styles.topMeta}>
        <span className={styles.metaPill}>Часовой пояс: МСК (UTC+3)</span>
        <span className={styles.metaPill}>
          Длительность консультации: до {cynologist.slotDurationMin} мин
        </span>
      </div>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}
      {paywallOpen ? (
        <AppSubscriptionPaywall
          mode="embedded"
          onRewardedGrant={async () => {
            setPaywallOpen(false);
            await loadSlots();
          }}
        />
      ) : loading ? (
        <div className={styles.loading}>
          <CircularProgress size={28} />
        </div>
      ) : (
        <div className={styles.layout}>
          <section className={styles.calendarPanel}>
            <div className={styles.calendarHeader}>
              <Button
                size="small"
                disabled={selectedMonthIndex <= 0}
                onClick={() => {
                  if (selectedMonthIndex > 0) {
                    setSelectedMonthKey(monthKeys[selectedMonthIndex - 1] ?? selectedMonthKey);
                  }
                }}
              >
                {"<"}
              </Button>
              <Typography className={styles.calendarMonth}>
                {currentMonthDate ? formatCalendarMonthLabel(currentMonthDate) : ""}
              </Typography>
              <Button
                size="small"
                disabled={selectedMonthIndex < 0 || selectedMonthIndex >= monthKeys.length - 1}
                onClick={() => {
                  if (selectedMonthIndex >= 0 && selectedMonthIndex < monthKeys.length - 1) {
                    setSelectedMonthKey(monthKeys[selectedMonthIndex + 1] ?? selectedMonthKey);
                  }
                }}
              >
                {">"}
              </Button>
            </div>
            <div className={styles.weekdays}>
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className={styles.calendarGrid} onClick={handleCalendarGridClick} role="presentation">
              {monthCells.map((dayKey, idx) => {
                if (!dayKey) {
                  return <div key={`empty-${idx}`} className={styles.emptyCell} />;
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
                  <button
                    key={dayKey}
                    type="button"
                    className={styles.dayCell}
                    disabled={!inRange}
                    data-consultation-day-key={dayKey}
                    data-weekend={isWeekend}
                    data-selected={isSelected}
                    data-in-range={inRange}
                    data-day-off={isDayOff}
                    data-no-free-slots={hasNoFreeSlots}
                  >
                    <span className={styles.dayNumber}>{dayDate.getUTCDate()}</span>
                    <span className={styles.dayCount}>
                      {inRange ? (isDayOff ? "0 св." : `${freeCount} св.`) : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={styles.slotsPanel}>
            <Typography className={styles.slotsTitle} component="h3">
              {selectedDayDate ? formatDayLabel(selectedDayDate) : "Слоты"}
            </Typography>
            {selectedDaySlots.length === 0 ? (
              <div className={styles.emptyState}>
                <Typography variant="body2">На выбранный день слотов нет.</Typography>
              </div>
            ) : (
              <div className={styles.slotList}>
                {selectedDaySlots.map((slot) => {
                  const start = new Date(slot.startAtUtc);
                  const end = new Date(slot.endAtUtc);
                  const isFree = slot.status === "FREE";
                  const statusLabel =
                    slot.status === "BOOKED"
                      ? "Занято"
                      : slot.status === "BLOCKED"
                        ? "Недоступно"
                        : "Свободно";

                  return (
                    <article className={styles.slotRow} key={slot.id} data-status={slot.status}>
                      <div>
                        <Typography className={styles.slotTime}>
                          {formatTime(start)} - {formatTime(end)}
                        </Typography>
                        <Typography className={styles.slotStatus}>{statusLabel}</Typography>
                      </div>
                      <Button
                        size="small"
                        variant={isFree ? "contained" : "outlined"}
                        disabled={pending || !isFree || verifyingSlotId === slot.id}
                        onClick={() => void verifyAndBook(slot.id, slot.startAtUtc, slot.endAtUtc)}
                      >
                        {isFree ? "Выбрать слот" : "Недоступно"}
                      </Button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </Box>
  );
}
