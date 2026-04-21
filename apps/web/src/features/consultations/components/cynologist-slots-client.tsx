"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";

import type { ConsultationSlotDto, ListedCynologistCardDto } from "@gafus/core";
import { reportClientError } from "@gafus/error-handling";

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

interface SlotsByDay {
  dateKey: string;
  slots: ConsultationSlotDto[];
}

const CONSULTATION_TIMEZONE = "Europe/Moscow";

function toDayKeyInTimezone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: CONSULTATION_TIMEZONE,
  }).format(date);
}

function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: CONSULTATION_TIMEZONE,
  }).format(date);
}

function formatDayLabel(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: CONSULTATION_TIMEZONE,
  }).format(date);
}

function toDayKey(date: Date): string {
  return toDayKeyInTimezone(date, CONSULTATION_TIMEZONE);
}

function toMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Загрузка свободных слотов и бронирование с Idempotency-Key и CSRF.
 */
export function CynologistSlotsClient({ cynologist }: CynologistSlotsClientProps) {
  const router = useRouter();
  const [slots, setSlots] = useState<ConsultationSlotDto[]>([]);
  const [dayOffDates, setDayOffDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending] = useTransition();
  const [verifyingSlotId, setVerifyingSlotId] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string>("");
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>("");

  const { fromDate, toDate, fromIso, toIso } = useMemo(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 14);
    return { fromDate: from, toDate: to, fromIso: from.toISOString(), toIso: to.toISOString() };
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
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? "Не удалось загрузить слоты");
        setSlots([]);
        setDayOffDates([]);
        return;
      }
      setSlots(json.data.filter((slot) => slot.status !== "BLOCKED"));
      setDayOffDates(Array.isArray(json.dayOffDates) ? json.dayOffDates : []);
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
  }, [cynologist.userId, fromIso, toIso]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const rangeDays = useMemo(() => {
    const out: Date[] = [];
    const cursor = new Date(fromDate);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(toDate);
    end.setHours(0, 0, 0, 0);

    while (cursor <= end) {
      out.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [fromDate, toDate]);

  const rangeDaySet = useMemo(() => {
    return new Set(rangeDays.map((d) => toDayKey(d)));
  }, [rangeDays]);

  const dayOffSet = useMemo(() => new Set(dayOffDates), [dayOffDates]);

  const visibleSlots = useMemo(() => {
    return slots.filter((slot) => {
      const slotDayKey = toDayKey(new Date(slot.startAtUtc));
      return !dayOffSet.has(slotDayKey);
    });
  }, [dayOffSet, slots]);

  const slotsByDay = useMemo<SlotsByDay[]>(() => {
    const grouped = new Map<string, ConsultationSlotDto[]>();
    for (const slot of visibleSlots) {
      const start = new Date(slot.startAtUtc);
      const dateKey = toDayKey(start);
      const bucket = grouped.get(dateKey);
      if (bucket) {
        bucket.push(slot);
      } else {
        grouped.set(dateKey, [slot]);
      }
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, daySlots]) => ({
        dateKey,
        slots: daySlots.sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc)),
      }));
  }, [visibleSlots]);

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
    setSelectedMonthKey((prev) => prev || toMonthKey(new Date(`${initialDay}T00:00:00`)));
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
    if (!currentMonthDate) {
      return [];
    }
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const leadingEmpty = (first.getDay() + 6) % 7;
    const out: Array<Date | null> = [];
    for (let i = 0; i < leadingEmpty; i += 1) {
      out.push(null);
    }
    for (let day = 1; day <= last.getDate(); day += 1) {
      out.push(new Date(year, month, day));
    }
    return out;
  }, [currentMonthDate]);

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

  const openConfirm = useCallback(
    (slotId: string, startAtUtc: string, endAtUtc: string) => {
      setError(null);
      try {
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
    [cynologist.userId, router],
  );

  const verifyAndBook = useCallback(
    async (slotId: string, startAtUtc: string, endAtUtc: string) => {
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
    [cynologist.userId, loadSlots, openConfirm],
  );

  return (
    <Box className={styles.container}>
      <div className={styles.topMeta}>
        <span className={styles.metaPill}>Часовой пояс: МСК (UTC+3)</span>
        <span className={styles.metaPill}>
          Длительность консультации: {cynologist.slotDurationMin} мин
        </span>
      </div>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}
      {loading ? (
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
                {currentMonthDate ? formatMonthLabel(currentMonthDate) : ""}
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
            <div className={styles.calendarGrid}>
              {monthCells.map((day, idx) => {
                if (!day) {
                  return <div key={`empty-${idx}`} className={styles.emptyCell} />;
                }
                const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                const inRange = rangeDaySet.has(dayKey);
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
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
                    data-weekend={isWeekend}
                    data-selected={isSelected}
                    data-in-range={inRange}
                    data-day-off={isDayOff}
                    data-no-free-slots={hasNoFreeSlots}
                    onClick={() => {
                      setSelectedDayKey(dayKey);
                    }}
                  >
                    <span className={styles.dayNumber}>{day.getDate()}</span>
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
