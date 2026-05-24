"use client";
import { useEffect, useMemo, useState } from "react";
import { TrainingStatus } from "@gafus/types";
import { STEP_STATUS_FILTER_LABELS } from "@gafus/core/utils/training";
import type {
  CourseTabType,
  ProgressFilterType,
  RatingFilterType,
  TrainingLevelType,
} from "@shared/utils/courseFilters";
import styles from "./FiltersDrawer.module.css";

interface FiltersDrawerProps {
  isOpen: boolean;
  onClose: () => void;

  // Табы
  activeTab: CourseTabType;
  onTabChange: (tab: CourseTabType) => void;

  // Фильтры
  activeLevel: TrainingLevelType;
  onLevelChange: (level: TrainingLevelType) => void;

  activeProgress: ProgressFilterType;
  onProgressChange: (progress: ProgressFilterType) => void;

  activeRating: RatingFilterType;
  onRatingChange: (rating: RatingFilterType) => void;

  // Сброс и применение
  onApply: () => void;
  onReset: () => void;

  // Функция для получения количества результатов по фильтрам
  getResultsCount?: (filters: {
    tab: CourseTabType;
    level: TrainingLevelType;
    progress: ProgressFilterType;
    rating: RatingFilterType;
  }) => number;
}

const tabOptions = [
  { id: "all" as CourseTabType, label: "Все" },
  { id: "free" as CourseTabType, label: "Бесплатные" },
  { id: "paid" as CourseTabType, label: "Платные" },
  { id: "private" as CourseTabType, label: "Приватные" },
];

const levelOptions = [
  { id: "ALL" as TrainingLevelType, label: "Все уровни" },
  { id: "BEGINNER" as TrainingLevelType, label: "Начальный" },
  { id: "INTERMEDIATE" as TrainingLevelType, label: "Средний" },
  { id: "ADVANCED" as TrainingLevelType, label: "Продвинутый" },
  { id: "EXPERT" as TrainingLevelType, label: "Экспертный" },
];

const progressOptions = [
  { id: "ALL" as ProgressFilterType, label: "Все курсы", icon: "📚" },
  {
    id: TrainingStatus.NOT_STARTED,
    label: STEP_STATUS_FILTER_LABELS[TrainingStatus.NOT_STARTED],
    icon: "⭐",
  },
  {
    id: TrainingStatus.IN_PROGRESS,
    label: STEP_STATUS_FILTER_LABELS[TrainingStatus.IN_PROGRESS],
    icon: "🔥",
  },
  {
    id: TrainingStatus.COMPLETED,
    label: STEP_STATUS_FILTER_LABELS[TrainingStatus.COMPLETED],
    icon: "✅",
  },
  {
    id: TrainingStatus.PAUSED,
    label: STEP_STATUS_FILTER_LABELS[TrainingStatus.PAUSED],
    icon: "⏸",
  },
  {
    id: TrainingStatus.RESET,
    label: STEP_STATUS_FILTER_LABELS[TrainingStatus.RESET],
    icon: "🔄",
  },
];

const ratingOptions = [
  { id: "ALL" as RatingFilterType, label: "Все курсы" },
  { id: "4+" as RatingFilterType, label: "4+ звезды" },
  { id: "3+" as RatingFilterType, label: "3+ звезды" },
  { id: "ANY" as RatingFilterType, label: "С рейтингом" },
];

export default function FiltersDrawer({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  activeLevel,
  onLevelChange,
  activeProgress,
  onProgressChange,
  activeRating,
  onRatingChange,
  onApply,
  onReset,
  getResultsCount,
}: FiltersDrawerProps) {
  // Локальные состояния для предпросмотра
  const [localTab, setLocalTab] = useState(activeTab);
  const [localLevel, setLocalLevel] = useState(activeLevel);
  const [localProgress, setLocalProgress] = useState(activeProgress);
  const [localRating, setLocalRating] = useState(activeRating);

  // Динамически пересчитываем количество результатов
  const previewCount = useMemo(
    () =>
      getResultsCount
        ? getResultsCount({
            tab: localTab,
            level: localLevel,
            progress: localProgress,
            rating: localRating,
          })
        : undefined,
    [getResultsCount, localTab, localLevel, localProgress, localRating],
  );

  // Синхронизируем локальные состояния с пропсами
  useEffect(() => {
    if (isOpen) {
      setLocalTab(activeTab);
      setLocalLevel(activeLevel);
      setLocalProgress(activeProgress);
      setLocalRating(activeRating);
    }
  }, [isOpen, activeTab, activeLevel, activeProgress, activeRating]);

  // Закрытие по Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Блокируем скролл body при открытом drawer
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleApply = () => {
    onTabChange(localTab);
    onLevelChange(localLevel);
    onProgressChange(localProgress);
    onRatingChange(localRating);
    onApply();
    onClose();
  };

  const handleReset = () => {
    setLocalTab("free");
    setLocalLevel("ALL");
    setLocalProgress("ALL");
    setLocalRating("ALL");
    onReset();
  };

  if (!isOpen) return null;

  const activeFiltersCount = [
    localTab !== "free",
    localLevel !== "ALL",
    localProgress !== "ALL",
    localRating !== "ALL",
  ].filter(Boolean).length;

  return (
    <>
      {/* Оверлей */}
      <div className={styles.overlay} onClick={onClose} />

      {/* Drawer */}
      <div className={styles.drawer}>
        {/* Шапка */}
        <div className={styles.header}>
          <h3 className={styles.title}>Фильтры</h3>
          <button className={styles.closeButton} onClick={onClose} aria-label="Закрыть">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Контент */}
        <div className={styles.content}>
          {/* Тип курса */}
          <div className={styles.filterSection}>
            <h4 className={styles.sectionTitle}>Тип курса</h4>
            <div className={styles.optionsGrid}>
              {tabOptions.map((option) => (
                <button
                  key={option.id}
                  className={`${styles.optionButton} ${localTab === option.id ? styles.active : ""}`}
                  onClick={() => setLocalTab(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Уровень сложности */}
          <div className={styles.filterSection}>
            <h4 className={styles.sectionTitle}>Уровень сложности</h4>
            <div className={styles.optionsGrid}>
              {levelOptions.map((option) => (
                <button
                  key={option.id}
                  className={`${styles.optionButton} ${localLevel === option.id ? styles.active : ""}`}
                  onClick={() => setLocalLevel(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Прогресс */}
          <div className={styles.filterSection}>
            <h4 className={styles.sectionTitle}>Прогресс обучения</h4>
            <div className={styles.optionsGrid}>
              {progressOptions.map((option) => (
                <button
                  key={option.id}
                  className={`${styles.optionButton} ${localProgress === option.id ? styles.active : ""}`}
                  onClick={() => setLocalProgress(option.id)}
                >
                  <span className={styles.emoji}>{option.icon}</span>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Рейтинг */}
          <div className={styles.filterSection}>
            <h4 className={styles.sectionTitle}>Рейтинг</h4>
            <div className={styles.optionsGrid}>
              {ratingOptions.map((option) => (
                <button
                  key={option.id}
                  className={`${styles.optionButton} ${localRating === option.id ? styles.active : ""}`}
                  onClick={() => setLocalRating(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Футер с кнопками */}
        <div className={styles.footer}>
          {activeFiltersCount > 0 && (
            <button className={styles.resetButton} onClick={handleReset}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 8h12M8 4l-4 4 4 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Сбросить
            </button>
          )}
          <button className={styles.applyButton} onClick={handleApply}>
            Показать
            {previewCount !== undefined && (
              <span className={styles.resultsCount}>{previewCount}</span>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
