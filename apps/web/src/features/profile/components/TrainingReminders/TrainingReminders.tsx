"use client";
import { ProfileIcon } from "../ProfileIcon";

import { reportClientError } from "@gafus/error-handling";
import { trackEvent } from "@gafus/analytics";
import { usePathname } from "next/navigation";
import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import {
  getTrainingReminders,
  createTrainingReminder,
  updateTrainingReminder,
  deleteTrainingReminder,
  type TrainingReminderData,
} from "@shared/lib/actions/trainingReminders";
import styles from "./TrainingReminders.module.css";
import { PrimaryButton } from "@/shared/components/ui/PrimaryButton";

const DAYS_OF_WEEK = [
  { id: "1", label: "Пн" },
  { id: "2", label: "Вт" },
  { id: "3", label: "Ср" },
  { id: "4", label: "Чт" },
  { id: "5", label: "Пт" },
  { id: "6", label: "Сб" },
  { id: "7", label: "Вс" },
];

const DEFAULT_TIME = "09:00";
const MAX_REMINDERS = 5;

export default function TrainingReminders() {
  const pathname = usePathname() ?? "/profile";
  const adding = useRef(false);
  const [creating, setCreating] = useState(false);
  const [reminders, setReminders] = useState<TrainingReminderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Определяем timezone браузера (мемоизировано)
  const browserTimezone = useMemo(() => {
    return typeof window !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "Europe/Moscow";
  }, []);

  // Загрузить список напоминаний (мемоизировано)
  const loadReminders = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getTrainingReminders();

      if (result.success && result.data) {
        setReminders(result.data);
      }
    } catch (err) {
      reportClientError(err, { issueKey: "TrainingReminders", keys: { operation: "load" } });
      console.error("Ошибка загрузки напоминаний");
    } finally {
      setLoading(false);
    }
  }, []); // setLoading и setReminders стабильны

  useEffect(() => {
    loadReminders();
  }, [loadReminders]);

  const handleAddReminder = useCallback(async () => {
    if (adding.current) return;
    if (reminders.length >= MAX_REMINDERS) {
      setMessage({
        type: "error",
        text: `Можно создать максимум ${MAX_REMINDERS} напоминаний`,
      });
      return;
    }

    adding.current = true;
    setCreating(true);
    try {
      trackEvent({
        eventName: "button_click",
        platform: "web",
        pathOrScreen: pathname,
        elementId: "profile-reminder-add-click",
      });
      const name = `задай название ${reminders.length + 1}`;
      const result = await createTrainingReminder(name, DEFAULT_TIME, undefined, browserTimezone);

      if (result.success && result.data) {
        trackEvent({
          eventName: "button_click",
          platform: "web",
          pathOrScreen: pathname,
          elementId: "profile-reminder-add-success",
        });
        setReminders((prev) => [...prev, result.data!]);
        setMessage({
          type: "success",
          text: "Напоминание создано",
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Не удалось создать напоминание",
        });
      }
    } catch (err) {
      reportClientError(err, { issueKey: "TrainingReminders", keys: { operation: "create" } });
      setMessage({
        type: "error",
        text: "Произошла ошибка",
      });
    } finally {
      adding.current = false;
      setCreating(false);
    }
  }, [reminders.length, browserTimezone, pathname]);

  const handleDeleteReminder = useCallback(
    async (id: string) => {
      try {
        trackEvent({
          eventName: "button_click",
          platform: "web",
          pathOrScreen: pathname,
          elementId: "profile-reminder-delete-click",
        });
        const result = await deleteTrainingReminder(id);

        if (result.success) {
          trackEvent({
            eventName: "button_click",
            platform: "web",
            pathOrScreen: pathname,
            elementId: "profile-reminder-delete-success",
          });
          setReminders((prev) => prev.filter((r) => r.id !== id));
          setMessage({
            type: "success",
            text: "Напоминание удалено",
          });
        } else {
          setMessage({
            type: "error",
            text: result.error || "Не удалось удалить",
          });
        }
      } catch (err) {
        reportClientError(err, { issueKey: "TrainingReminders", keys: { operation: "delete" } });
        setMessage({
          type: "error",
          text: "Произошла ошибка",
        });
      }
    },
    [pathname],
  ); // Пустой массив благодаря функциональному обновлению

  const handleUpdateReminder = useCallback(
    async (id: string, data: Partial<Omit<TrainingReminderData, "id">>) => {
      try {
        const updateData: {
          name?: string;
          enabled?: boolean;
          reminderTime?: string;
          reminderDays?: string | null;
          timezone?: string;
        } = {
          ...data,
          timezone: browserTimezone,
        };

        const result = await updateTrainingReminder(id, updateData);

        if (result.success && result.data) {
          trackEvent({
            eventName: "button_click",
            platform: "web",
            pathOrScreen: pathname,
            elementId: "profile-reminder-update-success",
          });
          setReminders((prev) => prev.map((r) => (r.id === id ? result.data! : r)));
          return true;
        } else {
          setMessage({
            type: "error",
            text: result.error || "Не удалось обновить",
          });
          return false;
        }
      } catch (err) {
        reportClientError(err, { issueKey: "TrainingReminders", keys: { operation: "update" } });
        setMessage({
          type: "error",
          text: "Произошла ошибка",
        });
        return false;
      }
    },
    [browserTimezone, pathname],
  ); // Только browserTimezone, reminders не нужен благодаря функциональному обновлению

  const handleCloseMessage = useCallback(() => {
    setMessage(null);
  }, []); // setMessage стабильна

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Загрузка напоминаний...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>
        <ProfileIcon name="reminders" /> Напоминания о тренировках
      </h3>

      <p className={styles.description}>
        Создайте до {MAX_REMINDERS} напоминаний в разное время (утро, день, вечер и т.д.)
      </p>

      {message && (
        <div className={`${styles.alert} ${styles[message.type]}`}>
          {message.text}
          <button className={styles.alertClose} onClick={handleCloseMessage} aria-label="Закрыть">
            ×
          </button>
        </div>
      )}

      <div className={styles.remindersList}>
        {reminders.map((reminder) => (
          <ReminderItem
            key={reminder.id}
            reminder={reminder}
            onUpdate={handleUpdateReminder}
            onDelete={handleDeleteReminder}
          />
        ))}
      </div>

      {reminders.length < MAX_REMINDERS && (
        <PrimaryButton
          disabled={creating}
          onClick={handleAddReminder}
          className={styles.addButton}
          fullWidth
        >
          + Добавить напоминание ({reminders.length}/{MAX_REMINDERS})
        </PrimaryButton>
      )}

      <div className={styles.infoBox}>
        <strong>ℹ️ Как это работает:</strong> Создайте несколько напоминаний в разное время. Мы
        будем присылать вам дружеские напоминания о тренировках в выбранное время и дни.
      </div>
    </div>
  );
}

// Отдельный компонент для каждого напоминания (мемоизирован)
const ReminderItem = memo(function ReminderItem({
  reminder,
  onUpdate,
  onDelete,
}: {
  reminder: TrainingReminderData;
  onUpdate: (id: string, data: Partial<Omit<TrainingReminderData, "id">>) => Promise<boolean>;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(reminder.name);
  const [enabled, setEnabled] = useState(reminder.enabled);
  const [reminderTime, setReminderTime] = useState(reminder.reminderTime);
  const [selectedDays, setSelectedDays] = useState<string[]>(
    reminder.reminderDays ? reminder.reminderDays.split(",") : [],
  );
  const [allDays, setAllDays] = useState(!reminder.reminderDays);
  const [isExpanded, setIsExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(reminder.name);
    setEnabled(reminder.enabled);
    setReminderTime(reminder.reminderTime);
    setSelectedDays(reminder.reminderDays ? reminder.reminderDays.split(",") : []);
    setAllDays(!reminder.reminderDays);
  }, [reminder.id, reminder.name, reminder.enabled, reminder.reminderTime, reminder.reminderDays]);

  const updating = useRef(false);
  const save = async (data: Partial<Omit<TrainingReminderData, "id">>) => {
    if (updating.current) return false;
    updating.current = true;
    setSaving(true);
    try {
      return await onUpdate(reminder.id, data);
    } finally {
      updating.current = false;
      setSaving(false);
    }
  };
  const handleToggleEnabled = async () => {
    const next = !enabled;
    if (await save({ enabled: next })) setEnabled(next);
  };
  const handleNameChange = async (newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === reminder.name) {
      setName(reminder.name);
      return;
    }
    if (!(await save({ name: trimmed }))) setName(reminder.name);
  };
  const handleTimeChange = async (time: string) => {
    if (time && (await save({ reminderTime: time }))) setReminderTime(time);
  };
  const handleDayToggle = async (dayId: string) => {
    const next = selectedDays.includes(dayId)
      ? selectedDays.filter((d) => d !== dayId)
      : [...selectedDays, dayId];
    if (await save({ reminderDays: next.length ? next.join(",") : null })) {
      setSelectedDays(next);
      setAllDays(next.length === 0);
    }
  };
  const handleAllDaysToggle = async () => {
    if (allDays) {
      setAllDays(false);
      return;
    }
    if (await save({ reminderDays: null })) {
      setAllDays(true);
      setSelectedDays([]);
    }
  };

  return (
    <div className={`${styles.reminderItem} ${isExpanded ? styles.expanded : ""}`}>
      <div className={styles.reminderHeader}>
        <label className={styles.switchLabel}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={handleToggleEnabled}
            disabled={saving}
            className={styles.switchInput}
          />
          <span className={styles.switchSlider}></span>
        </label>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={(e) => handleNameChange(e.target.value)}
          className={styles.nameInput}
          disabled={saving}
        />

        <span className={styles.timePreview}>{reminderTime}</span>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={styles.expandButton}
          aria-label={isExpanded ? "Свернуть" : "Развернуть"}
        >
          {isExpanded ? "▲" : "▼"}
        </button>

        <button
          disabled={saving}
          onClick={() => onDelete(reminder.id)}
          className={styles.deleteButton}
          aria-label="Удалить"
        >
          ×
        </button>
      </div>

      {isExpanded && enabled && (
        <div className={styles.reminderDetails}>
          {/* Время */}
          <div className={styles.settingGroup}>
            <label htmlFor={`time-${reminder.id}`} className={styles.label}>
              Время
            </label>
            <input
              type="time"
              id={`time-${reminder.id}`}
              value={reminderTime}
              onChange={(e) => handleTimeChange(e.target.value)}
              disabled={saving}
              className={styles.timeInput}
            />
          </div>

          {/* Дни недели */}
          <div className={styles.settingGroup}>
            <label className={styles.label}>Дни</label>

            <label className={styles.dayCheckbox}>
              <input
                type="checkbox"
                checked={allDays}
                onChange={handleAllDaysToggle}
                disabled={saving}
              />
              <span className={styles.dayLabel}>Все дни</span>
            </label>

            {!allDays && (
              <div className={styles.daysGrid}>
                {DAYS_OF_WEEK.map((day) => (
                  <label key={day.id} className={styles.dayButton}>
                    <input
                      type="checkbox"
                      checked={selectedDays.includes(day.id)}
                      onChange={() => handleDayToggle(day.id)}
                      disabled={saving}
                      className={styles.dayInput}
                    />
                    <span className={styles.dayButtonLabel}>{day.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
