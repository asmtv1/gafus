"use client";
import { useState, useRef, useEffect } from "react";
import { STEP_STATUS_FILTER_LABELS } from "@gafus/core/utils/training";
import type {
  CourseTabType,
  ProgressFilterType,
  RatingFilterType,
  SortingType,
  TrainingLevelType,
} from "@shared/utils/courseFilters";
import FiltersDrawer from "./FiltersDrawer";
import styles from "./CourseFilters.module.css";

interface CourseFiltersProps {
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

  activeSorting: SortingType;
  onSortingChange: (sorting: SortingType) => void;

  // Сброс фильтров
  onResetFilters?: () => void;

  // Функция для получения количества результатов по фильтрам
  getResultsCount?: (filters: {
    tab: CourseTabType;
    level: TrainingLevelType;
    progress: ProgressFilterType;
    rating: RatingFilterType;
  }) => number;
}

const sortingOptions = [
  { id: "newest" as SortingType, label: "Новые → Старые", icon: "🕒" },
  { id: "rating" as SortingType, label: "По рейтингу", icon: "⭐" },
  { id: "name" as SortingType, label: "По названию (А → Я)", icon: "🔤" },
  { id: "progress" as SortingType, label: "По прогрессу", icon: "📊" },
];

const tabLabels: Record<CourseTabType, string> = {
  all: "Все",
  free: "Бесплатные",
  paid: "Платные",
  private: "Приватные",
};

const levelLabels: Record<TrainingLevelType, string> = {
  ALL: "Все уровни",
  BEGINNER: "Начальный",
  INTERMEDIATE: "Средний",
  ADVANCED: "Продвинутый",
  EXPERT: "Экспертный",
};

const progressLabels: Record<ProgressFilterType, string> = {
  ALL: "Все курсы",
  ...STEP_STATUS_FILTER_LABELS,
};

const ratingLabels: Record<RatingFilterType, string> = {
  ALL: "Все курсы",
  "4+": "4+ звезды",
  "3+": "3+ звезды",
  ANY: "С рейтингом",
};

function Dropdown({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  return (
    <div className={styles.dropdown} ref={dropdownRef}>
      {children}
    </div>
  );
}

export default function CourseFilters({
  activeTab,
  onTabChange,
  activeLevel,
  onLevelChange,
  activeProgress,
  onProgressChange,
  activeRating,
  onRatingChange,
  activeSorting,
  onSortingChange,
  onResetFilters,
  getResultsCount,
}: CourseFiltersProps) {
  const [openDropdowns, setOpenDropdowns] = useState<Record<string, boolean>>({
    sorting: false,
  });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const toggleDropdown = (key: string) => {
    setOpenDropdowns((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const closeDropdown = (key: string) => {
    setOpenDropdowns((prev) => ({
      ...prev,
      [key]: false,
    }));
  };

  // Подсчитываем активные фильтры (не по умолчанию)
  const activeFiltersCount = [
    activeTab !== "all",
    activeLevel !== "ALL",
    activeProgress !== "ALL",
    activeRating !== "ALL",
  ].filter(Boolean).length;

  // Сброс всех фильтров к значениям по умолчанию
  const handleResetFilters = () => {
    onTabChange("all");
    onLevelChange("ALL");
    onProgressChange("ALL");
    onRatingChange("ALL");

    // Вызываем дополнительный коллбек если передан
    onResetFilters?.();
  };

  // Список активных фильтров (не «все») для отображения чипами
  const activeFiltersList: { id: string; label: string; onClear: () => void }[] = [];
  if (activeTab !== "all") {
    activeFiltersList.push({
      id: "tab",
      label: tabLabels[activeTab],
      onClear: () => onTabChange("all"),
    });
  }
  if (activeLevel !== "ALL") {
    activeFiltersList.push({
      id: "level",
      label: levelLabels[activeLevel],
      onClear: () => onLevelChange("ALL"),
    });
  }
  if (activeProgress !== "ALL") {
    activeFiltersList.push({
      id: "progress",
      label: progressLabels[activeProgress],
      onClear: () => onProgressChange("ALL"),
    });
  }
  if (activeRating !== "ALL") {
    activeFiltersList.push({
      id: "rating",
      label: ratingLabels[activeRating],
      onClear: () => onRatingChange("ALL"),
    });
  }

  return (
    <>
      <div className={styles.filtersContainer}>
        {/* Контейнер с двумя кнопками по сторонам */}
        <div className={styles.controlsRow}>
          {/* Кнопка сортировки - слева */}
          <Dropdown isOpen={openDropdowns.sorting} onClose={() => closeDropdown("sorting")}>
            <button className={styles.sortButton} onClick={() => toggleDropdown("sorting")}>
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                className={styles.sortIcon}
              >
                <path
                  d="M8 5v14M8 5l-3 3M8 5l3 3M16 19V5M16 19l-3-3M16 19l3-3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Сортировка</span>
              <svg
                className={`${styles.arrow} ${openDropdowns.sorting ? styles.open : ""}`}
                width="12"
                height="12"
                viewBox="0 0 12 12"
              >
                <path
                  d="M2 4l4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {openDropdowns.sorting && (
              <div className={styles.dropdownMenu}>
                {sortingOptions.map((option) => (
                  <button
                    key={option.id}
                    className={`${styles.option} ${activeSorting === option.id ? styles.active : ""}`}
                    onClick={() => {
                      onSortingChange(option.id);
                      closeDropdown("sorting");
                    }}
                  >
                    <span className={styles.icon}>{option.icon}</span>
                    {option.label}
                    {activeSorting === option.id && (
                      <svg className={styles.checkmark} width="16" height="16" viewBox="0 0 16 16">
                        <path
                          d="M3 8l3 3 7-7"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Dropdown>

          {/* Кнопка фильтров - справа */}
          <button className={styles.filterToggleButton} onClick={() => setIsDrawerOpen(true)}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              className={styles.filterIcon}
            >
              <path
                d="M4 6h16M6 12h12M8 18h8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="8" cy="6" r="2" fill="currentColor" />
              <circle cx="16" cy="12" r="2" fill="currentColor" />
              <circle cx="12" cy="18" r="2" fill="currentColor" />
            </svg>
            <span>Фильтры</span>
            {activeFiltersCount > 0 && (
              <span className={styles.activeFiltersBadge}>{activeFiltersCount}</span>
            )}
          </button>
        </div>

        {/* Выбранные фильтры — чипы с крестиком для сброса в «все» */}
        {activeFiltersList.length > 0 && (
          <div className={styles.activeFiltersChips}>
            {activeFiltersList.map((item) => (
              <span key={item.id} className={styles.activeFilterChip}>
                <span className={styles.activeFilterChipLabel}>{item.label}</span>
                <button
                  type="button"
                  className={styles.activeFilterChipRemove}
                  onClick={item.onClear}
                  aria-label={`Сбросить: ${item.label}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Drawer с фильтрами */}
      <FiltersDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        activeTab={activeTab}
        onTabChange={onTabChange}
        activeLevel={activeLevel}
        onLevelChange={onLevelChange}
        activeProgress={activeProgress}
        onProgressChange={onProgressChange}
        activeRating={activeRating}
        onRatingChange={onRatingChange}
        onApply={() => {
          // Фильтры применяются автоматически через onChange колбэки
        }}
        onReset={handleResetFilters}
        getResultsCount={getResultsCount}
      />
    </>
  );
}
