"use client";

import { useEffect, useState, type ReactNode } from "react";

import styles from "./profile.module.css";

type ProfileView = "activity" | "questions" | "settings" | "notes";

interface ProfileSectionsProps {
  isOwner: boolean;
  initialView: ProfileView;
  activity: ReactNode;
  questions?: ReactNode;
  settings?: ReactNode;
  notes?: ReactNode;
}

/** Profile-only navigation state. Data loading and permissions stay in the existing features/core. */
export default function ProfileSections({
  isOwner,
  initialView,
  activity,
  questions,
  settings,
  notes,
}: ProfileSectionsProps) {
  const [view, setView] = useState<ProfileView>(isOwner ? initialView : "activity");

  useEffect(() => {
    setView(isOwner ? initialView : "activity");
  }, [initialView, isOwner]);

  useEffect(() => {
    const syncFromUrl = () => {
      const url = new URL(window.location.href);
      const tab = url.searchParams.get("tab");
      setView(isOwner && (tab === "settings" || tab === "questions" || tab === "notes") ? tab : "activity");
    };
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [isOwner]);

  const selectView = (next: ProfileView) => {
    setView(next);
    const url = new URL(window.location.href);
    if (next !== "activity") {
      url.searchParams.set("tab", next);
    } else {
      url.searchParams.delete("tab");
    }
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };

  return (
    <>
      <nav className={styles.sectionNavigation} aria-label="Разделы профиля">
        <div className={styles.contentNavigation}>
          <button
            type="button"
            className={`${styles.navigationItem} ${view === "activity" ? styles.navigationActive : ""}`}
            aria-pressed={view === "activity"}
            onClick={() => selectView("activity")}
          >
            {isOwner ? "Мои публикации" : "Публикации"}
          </button>
          {isOwner && (
            <button
              type="button"
              className={`${styles.navigationItem} ${view === "questions" ? styles.navigationActive : ""}`}
              aria-pressed={view === "questions"}
              onClick={() => selectView("questions")}
            >
              Мои вопросы
            </button>
          )}
          {isOwner && (
            <button
              type="button"
              className={`${styles.navigationItem} ${view === "settings" ? styles.navigationActive : ""}`}
              aria-pressed={view === "settings"}
              onClick={() => selectView("settings")}
            >
              Настройки аккаунта
            </button>
          )}
          {isOwner && (
            <button
              type="button"
              className={`${styles.navigationItem} ${view === "notes" ? styles.navigationActive : ""}`}
              aria-pressed={view === "notes"}
              onClick={() => selectView("notes")}
            >
              Заметки кинолога
            </button>
          )}
        </div>
      </nav>

      <div
        id={view === "settings" ? "profile-settings" : view === "questions" ? "profile-questions" : view === "notes" ? "profile-notes" : "profile-activity"}
        className={styles.viewContent}
      >
        {view === "settings" && isOwner ? settings : view === "questions" && isOwner ? questions : view === "notes" && isOwner ? notes : activity}
      </div>
    </>
  );
}
