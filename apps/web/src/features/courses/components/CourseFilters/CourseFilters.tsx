"use client";
import { useState, useRef, useEffect } from "react";
import { TrainingStatus } from "@gafus/types";
import type { CourseTabType } from "../CourseTabs/CourseTabs";
import styles from "./CourseFilters.module.css";

export type TrainingLevelType = "ALL" | "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
export type ProgressFilterType = "ALL" | TrainingStatus;
export type SortingType = "newest" | "rating" | "name" | "progress";
export type RatingFilterType = "ALL" | "4+" | "3+" | "ANY";

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
}

const tabOptions = [
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
  { id: TrainingStatus.NOT_STARTED, label: "Не начатые", icon: "⭐" },
  { id: TrainingStatus.IN_PROGRESS, label: "В процессе", icon: "🔥" },
  { id: TrainingStatus.COMPLETED, label: "Завершённые", icon: "✅" },
];

const ratingOptions = [
  { id: "ALL" as RatingFilterType, label: "Все курсы" },
  { id: "4+" as RatingFilterType, label: "4+ звезды" },
  { id: "3+" as RatingFilterType, label: "3+ звезды" },
  { id: "ANY" as RatingFilterType, label: "С рейтингом" },
];

const sortingOptions = [
  { id: "newest" as SortingType, label: "Новые → Старые", icon: "🕒" },
  { id: "rating" as SortingType, label: "По рейтингу", icon: "⭐" },
  { id: "name" as SortingType, label: "По названию (А → Я)", icon: "🔤" },
  { id: "progress" as SortingType, label: "По прогрессу", icon: "📊" },
];

interface DropdownProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

interface FilterOption {
  id: string;
  label: string;
  icon?: string;
}

function Dropdown({ isOpen, onToggle, onClose, children }: DropdownProps) {
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
}: CourseFiltersProps) {
  const [openDropdowns, setOpenDropdowns] = useState<Record<string, boolean>>({});
  const [showFilters, setShowFilters] = useState(false);

  const toggleDropdown = (key: string) => {
    setOpenDropdowns(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const closeDropdown = (key: string) => {
    setOpenDropdowns(prev => ({
      ...prev,
      [key]: false
    }));
  };

  const getActiveOption = (options: FilterOption[], activeId: string) => {
    return options.find(opt => opt.id === activeId);
  };

  // Подсчитываем активные фильтры (не по умолчанию)
  const activeFiltersCount = [
    activeTab !== "free",
    activeLevel !== "ALL", 
    activeProgress !== "ALL",
    activeRating !== "ALL",
    activeSorting !== "newest"
  ].filter(Boolean).length;

  // Сброс всех фильтров к значениям по умолчанию
  const handleResetFilters = () => {
    onTabChange("free");
    onLevelChange("ALL");
    onProgressChange("ALL");
    onRatingChange("ALL");
    onSortingChange("newest");
    
    // Закрываем все выпадающие списки
    setOpenDropdowns({});
    
    // Вызываем дополнительный коллбек если передан
    onResetFilters?.();
  };

  return (
    <div className={styles.filtersContainer}>
      {/* Кнопки управления фильтрами */}
      <div className={styles.toggleButtonContainer}>
        <button
          className={styles.toggleButton}
          onClick={() => setShowFilters(!showFilters)}
        >
          <span className={styles.toggleText}>
            {showFilters ? "Скрыть фильтры" : "Добавить фильтры"}
            {activeFiltersCount > 0 && !showFilters && (
              <span className={styles.activeFiltersBadge}>
                {activeFiltersCount}
              </span>
            )}
          </span>
          <svg 
            className={`${styles.toggleArrow} ${showFilters ? styles.open : ""}`}
            width="16" 
            height="16" 
            viewBox="0 0 16 16" 
            fill="none"
          >
            <path 
              d="M4 6l4 4 4-4" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* Кнопка сброса фильтров */}
        {activeFiltersCount > 0 && (
          <button
            className={styles.toggleButton}
            onClick={handleResetFilters}
            title="Сбросить все фильтры"
          >
            <span className={styles.toggleText}>
              Сбросить фильтры
            </span>
            <svg 
              className={styles.resetIcon}
              width="16" 
              height="16" 
              viewBox="0 0 16 16" 
              fill="none"
            >
              <path 
                d="M1 4v6h6M15 12V6H9M3 7l4-4 4 4" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Основные фильтры */}
      {showFilters && (
        <div className={styles.mainFilters}>
        {/* Тип курса */}
        <Dropdown
          isOpen={openDropdowns.tab}
          onToggle={() => toggleDropdown('tab')}
          onClose={() => closeDropdown('tab')}
        >
          <button
            className={styles.filterButton}
            onClick={() => toggleDropdown('tab')}
          >
            <span className={styles.label}>Тип:</span>
            <span className={styles.value}>{getActiveOption(tabOptions, activeTab)?.label}</span>
            <svg className={`${styles.arrow} ${openDropdowns.tab ? styles.open : ""}`} width="12" height="12" viewBox="0 0 12 12">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          
          {openDropdowns.tab && (
            <div className={styles.dropdownMenu}>
              {tabOptions.map((option) => (
                <button
                  key={option.id}
                  className={`${styles.option} ${activeTab === option.id ? styles.active : ""}`}
                  onClick={() => {
                    onTabChange(option.id);
                    closeDropdown('tab');
                  }}
                >
                  {option.label}
                  {activeTab === option.id && (
                    <svg className={styles.checkmark} width="16" height="16" viewBox="0 0 16 16">
                      <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </Dropdown>

        {/* Уровень сложности */}
        <Dropdown
          isOpen={openDropdowns.level}
          onToggle={() => toggleDropdown('level')}
          onClose={() => closeDropdown('level')}
        >
          <button
            className={styles.filterButton}
            onClick={() => toggleDropdown('level')}
          >
            <span className={styles.label}>Уровень:</span>
            <span className={styles.value}>{getActiveOption(levelOptions, activeLevel)?.label}</span>
            <svg className={`${styles.arrow} ${openDropdowns.level ? styles.open : ""}`} width="12" height="12" viewBox="0 0 12 12">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          
          {openDropdowns.level && (
            <div className={styles.dropdownMenu}>
              {levelOptions.map((option) => (
                <button
                  key={option.id}
                  className={`${styles.option} ${activeLevel === option.id ? styles.active : ""}`}
                  onClick={() => {
                    onLevelChange(option.id);
                    closeDropdown('level');
                  }}
                >
                  {option.label}
                  {activeLevel === option.id && (
                    <svg className={styles.checkmark} width="16" height="16" viewBox="0 0 16 16">
                      <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </Dropdown>

        {/* Прогресс */}
        <Dropdown
          isOpen={openDropdowns.progress}
          onToggle={() => toggleDropdown('progress')}
          onClose={() => closeDropdown('progress')}
        >
          <button
            className={styles.filterButton}
            onClick={() => toggleDropdown('progress')}
          >
            <span className={styles.label}>Прогресс:</span>
            <span className={styles.value}>
              <span className={styles.icon}>{getActiveOption(progressOptions, activeProgress)?.icon}</span>
              {getActiveOption(progressOptions, activeProgress)?.label}
            </span>
            <svg className={`${styles.arrow} ${openDropdowns.progress ? styles.open : ""}`} width="12" height="12" viewBox="0 0 12 12">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          
          {openDropdowns.progress && (
            <div className={styles.dropdownMenu}>
              {progressOptions.map((option) => (
                <button
                  key={option.id}
                  className={`${styles.option} ${activeProgress === option.id ? styles.active : ""}`}
                  onClick={() => {
                    onProgressChange(option.id);
                    closeDropdown('progress');
                  }}
                >
                  <span className={styles.icon}>{option.icon}</span>
                  {option.label}
                  {activeProgress === option.id && (
                    <svg className={styles.checkmark} width="16" height="16" viewBox="0 0 16 16">
                      <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </Dropdown>

        {/* Дополнительные фильтры */}
        <div className={styles.additionalFilters}>
        {/* Рейтинг */}
        <Dropdown
          isOpen={openDropdowns.rating}
          onToggle={() => toggleDropdown('rating')}
          onClose={() => closeDropdown('rating')}
        >
          <button
            className={styles.filterButton}
            onClick={() => toggleDropdown('rating')}
          >
            <span className={styles.label}>Рейтинг:</span>
            <span className={styles.value}>{getActiveOption(ratingOptions, activeRating)?.label}</span>
            <svg className={`${styles.arrow} ${openDropdowns.rating ? styles.open : ""}`} width="12" height="12" viewBox="0 0 12 12">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          
          {openDropdowns.rating && (
            <div className={styles.dropdownMenu}>
              {ratingOptions.map((option) => (
                <button
                  key={option.id}
                  className={`${styles.option} ${activeRating === option.id ? styles.active : ""}`}
                  onClick={() => {
                    onRatingChange(option.id);
                    closeDropdown('rating');
                  }}
                >
                  {option.label}
                  {activeRating === option.id && (
                    <svg className={styles.checkmark} width="16" height="16" viewBox="0 0 16 16">
                      <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </Dropdown>

        {/* Сортировка */}
        <Dropdown
          isOpen={openDropdowns.sorting}
          onToggle={() => toggleDropdown('sorting')}
          onClose={() => closeDropdown('sorting')}
        >
          <button
            className={styles.filterButton}
            onClick={() => toggleDropdown('sorting')}
          >
            <span className={styles.label}>Сортировка:</span>
            <span className={styles.value}>
              <span className={styles.icon}>{getActiveOption(sortingOptions, activeSorting)?.icon}</span>
              {getActiveOption(sortingOptions, activeSorting)?.label}
            </span>
            <svg className={`${styles.arrow} ${openDropdowns.sorting ? styles.open : ""}`} width="12" height="12" viewBox="0 0 12 12">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
                    closeDropdown('sorting');
                  }}
                >
                  <span className={styles.icon}>{option.icon}</span>
                  {option.label}
                  {activeSorting === option.id && (
                    <svg className={styles.checkmark} width="16" height="16" viewBox="0 0 16 16">
                      <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </Dropdown>
        </div>
        </div>
      )}
    </div>
  );
}
