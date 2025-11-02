"use client";
import styles from "./CourseTabs.module.css";

export type CourseTabType = "free" | "paid" | "private";

interface CourseTabsProps {
  activeTab: CourseTabType;
  onTabChange: (tab: CourseTabType) => void;
}

const tabs = [
  { id: "free" as CourseTabType, label: "Бесплатные" },
  // TODO: Вернуться к реализации платных курсов
  // { id: "paid" as CourseTabType, label: "Платные" },
  { id: "private" as CourseTabType, label: "Приватные" },
];

export default function CourseTabs({ activeTab, onTabChange }: CourseTabsProps) {
  return (
    <div className={styles.tabsContainer}>
      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ""}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
