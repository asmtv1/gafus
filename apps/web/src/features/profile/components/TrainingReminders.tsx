"use client";

import { useState, useEffect } from "react";
import {
  getTrainingReminders,
  createTrainingReminder,
  updateTrainingReminder,
  deleteTrainingReminder,
  type TrainingReminderData
} from "@shared/lib/actions/trainingReminders";
import styles from "./TrainingReminders.module.css";

const DAYS_OF_WEEK = [
  { id: "1", label: "Пн" },
  { id: "2", label: "Вт" },
  { id: "3", label: "Ср" },
  { id: "4", label: "Чт" },
  { id: "5", label: "Пт" },
  { id: "6", label: "Сб" },
  { id: "7", label: "Вс" }
];

const DEFAULT_TIME = "09:00";
const MAX_REMINDERS = 5;

export default function TrainingReminders() {
  const [reminders, setReminders] = useState<TrainingReminderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Определяем timezone браузера
  const browserTimezone = typeof window !== "undefined" 
    ? Intl.DateTimeFormat().resolvedOptions().timeZone 
    : "Europe/Moscow";

  // Загрузить список напоминаний
  useEffect(() => {
    loadReminders();
  }, []);

  const loadReminders = async () => {
    try {
      setLoading(true);
      const result = await getTrainingReminders();

      if (result.success && result.data) {
        setReminders(result.data);
      }
    } catch {
      console.error("Ошибка загрузки напоминаний");
    } finally {
      setLoading(false);
    }
  };

  const handleAddReminder = async () => {
    if (reminders.length >= MAX_REMINDERS) {
      setMessage({
        type: "error",
        text: `Можно создать максимум ${MAX_REMINDERS} напоминаний`
      });
      return;
    }

    try {
      const name = `задай название ${reminders.length + 1}`;
      const result = await createTrainingReminder(
        name,
        DEFAULT_TIME,
        undefined,
        browserTimezone
      );

      if (result.success && result.data) {
        setReminders([...reminders, result.data]);
        setMessage({
          type: "success",
          text: "Напоминание создано"
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Не удалось создать напоминание"
        });
      }
    } catch {
      setMessage({
        type: "error",
        text: "Произошла ошибка"
      });
    }
  };

  const handleDeleteReminder = async (id: string) => {
    try {
      const result = await deleteTrainingReminder(id);

      if (result.success) {
        setReminders(reminders.filter(r => r.id !== id));
        setMessage({
          type: "success",
          text: "Напоминание удалено"
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Не удалось удалить"
        });
      }
    } catch {
      setMessage({
        type: "error",
        text: "Произошла ошибка"
      });
    }
  };

  const handleUpdateReminder = async (
    id: string,
    data: Partial<Omit<TrainingReminderData, 'id'>>
  ) => {
    try {
      const updateData: {
        name?: string;
        enabled?: boolean;
        reminderTime?: string;
        reminderDays?: string;
        timezone?: string;
      } = {
        ...data,
        reminderDays: data.reminderDays === null ? undefined : data.reminderDays,
        timezone: browserTimezone
      };

      const result = await updateTrainingReminder(id, updateData);

      if (result.success && result.data) {
        setReminders(reminders.map(r => r.id === id ? result.data! : r));
        return true;
      } else {
        setMessage({
          type: "error",
          text: result.error || "Не удалось обновить"
        });
        return false;
      }
    } catch {
      setMessage({
        type: "error",
        text: "Произошла ошибка"
      });
      return false;
    }
  };

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
      <h3 className={styles.title}>Напоминания о тренировках</h3>

      <p className={styles.description}>
        Создайте до {MAX_REMINDERS} напоминаний в разное время (утро, день, вечер и т.д.)
      </p>

      {message && (
        <div className={`${styles.alert} ${styles[message.type]}`}>
          {message.text}
          <button 
            className={styles.alertClose}
            onClick={() => setMessage(null)}
            aria-label="Закрыть"
          >
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
        <button
          onClick={handleAddReminder}
          className={styles.addButton}
        >
          + Добавить напоминание ({reminders.length}/{MAX_REMINDERS})
        </button>
      )}

      <div className={styles.infoBox}>
        <strong>ℹ️ Как это работает:</strong> Создайте несколько напоминаний в разное время.
        Мы будем присылать вам дружеские напоминания о тренировках в выбранное время и дни.
      </div>
    </div>
  );
}

// Отдельный компонент для каждого напоминания
function ReminderItem({
  reminder,
  onUpdate,
  onDelete
}: {
  reminder: TrainingReminderData;
  onUpdate: (id: string, data: Partial<Omit<TrainingReminderData, 'id'>>) => Promise<boolean>;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(reminder.name);
  const [enabled, setEnabled] = useState(reminder.enabled);
  const [reminderTime, setReminderTime] = useState(reminder.reminderTime);
  const [selectedDays, setSelectedDays] = useState<string[]>(
    reminder.reminderDays ? reminder.reminderDays.split(",") : []
  );
  const [allDays, setAllDays] = useState(!reminder.reminderDays);
  const [isExpanded, setIsExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleToggleEnabled = async () => {
    setSaving(true);
    const success = await onUpdate(reminder.id, { enabled: !enabled });
    if (success) setEnabled(!enabled);
    setSaving(false);
  };

  const handleNameChange = async (newName: string) => {
    if (!newName.trim()) return;
    setName(newName);
    await onUpdate(reminder.id, { name: newName });
  };

  const handleTimeChange = async (time: string) => {
    if (!time) return;
    setReminderTime(time);
    await onUpdate(reminder.id, { reminderTime: time });
  };

  const handleDayToggle = async (dayId: string) => {
    const newSelectedDays = selectedDays.includes(dayId)
      ? selectedDays.filter(d => d !== dayId)
      : [...selectedDays, dayId];
    
    setSelectedDays(newSelectedDays);
    await onUpdate(reminder.id, { 
      reminderDays: newSelectedDays.length > 0 ? newSelectedDays.join(",") : undefined 
    });
  };

  const handleAllDaysToggle = async () => {
    const newAllDays = !allDays;
    setAllDays(newAllDays);
    
    if (newAllDays) {
      setSelectedDays([]);
      await onUpdate(reminder.id, { reminderDays: undefined });
    }
  };

  return (
    <div className={`${styles.reminderItem} ${isExpanded ? styles.expanded : ''}`}>
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
}
