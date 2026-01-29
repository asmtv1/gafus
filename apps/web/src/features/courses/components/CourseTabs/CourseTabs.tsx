"use client";
import styles from "./CourseTabs.module.css";

export type CourseTabType = "all" | "free" | "paid" | "private";

interface CourseTabsProps {
  activeTab: CourseTabType;
  onTabChange: (tab: CourseTabType) => void;
}

const tabs = [
  { id: "all" as CourseTabType, label: "Все" },
  { id: "free" as CourseTabType, label: "Бесплатные" },
  { id: "paid" as CourseTabType, label: "Платные" },
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
