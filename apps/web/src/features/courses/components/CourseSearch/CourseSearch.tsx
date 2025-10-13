"use client";
import { useEffect, useState } from "react";
import styles from "./CourseSearch.module.css";

interface CourseSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function CourseSearch({ 
  value, 
  onChange, 
  placeholder = "Поиск курсов..." 
}: CourseSearchProps) {
  const [localValue, setLocalValue] = useState(value);

  // Debounce для оптимизации поиска
  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(localValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [localValue, onChange]);

  const handleClear = () => {
    setLocalValue("");
    onChange("");
  };

  return (
    <div className={styles.searchContainer}>
      <div className={styles.searchWrapper}>
        <svg 
          className={styles.searchIcon} 
          width="20" 
          height="20" 
          viewBox="0 0 20 20" 
          fill="none"
        >
          <path 
            d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16zM19 19l-4.35-4.35" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
        </svg>
        <input
          type="text"
          className={styles.searchInput}
          placeholder={placeholder}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
        />
        {localValue && (
          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            aria-label="Очистить поиск"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path 
                d="M12 4L4 12M4 4l8 8" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

