"use client";

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import primaryButtonStyles from "@/shared/components/ui/PrimaryButton.module.css";
import secondaryButtonStyles from "@/shared/components/ui/SecondaryButton.module.css";

import styles from "./profile.module.css";

type ProfileView = "activity" | "questions" | "settings" | "notes" | "gafus";

interface ProfileSectionsProps {
  isOwner: boolean;
  username: string;
  initialView: ProfileView;
  activity: ReactNode;
  questions?: ReactNode;
  settings?: ReactNode;
  notes?: ReactNode;
  wallet?: ReactNode;
}

/** Profile-only navigation state. Data loading and permissions stay in the existing features/core. */
export default function ProfileSections({
  isOwner,
  username,
  initialView,
  activity,
  questions,
  settings,
  notes,
  wallet,
}: ProfileSectionsProps) {
  const visitorView = initialView === "questions" ? "questions" : "activity";
  const [view, setView] = useState<ProfileView>(isOwner ? initialView : visitorView);

  useEffect(() => {
    setView(isOwner ? initialView : visitorView);
  }, [initialView, isOwner, username, visitorView]);

  useEffect(() => {
    const syncFromUrl = () => {
      const url = new URL(window.location.href);
      const tab = url.searchParams.get("tab");
      setView(
        tab === "questions" || (isOwner && (tab === "settings" || tab === "notes" || tab === "gafus"))
          ? tab
          : "activity",
      );
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

  const onVisitorKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const next = event.key === "Home"
      ? "activity"
      : event.key === "End"
        ? "questions"
        : view === "activity" ? "questions" : "activity";
    selectView(next);
    const target = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
      `[data-profile-view="${next}"]`,
    );
    target?.focus();
  };

  return (
    <>
      {!isOwner ? (
        <div
          className={styles.visitorNavigation}
          role="radiogroup"
          aria-label={`Разделы профиля @${username}`}
        >
          {(["activity", "questions"] as const).map((option) => {
            const active = view === option;
            const label = option === "activity" ? "Публикации" : "Вопросы";
            return (
              <button
                key={option}
                type="button"
                className={`${active ? primaryButtonStyles.root : secondaryButtonStyles.root} ${styles.visitorToggle}`}
                role="radio"
                data-profile-view={option}
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => selectView(option)}
                onKeyDown={onVisitorKeyDown}
              >
                {label} @{username}
              </button>
            );
          })}
        </div>
      ) : (
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
            {isOwner && (
              <button
                type="button"
                className={`${styles.navigationItem} ${view === "gafus" ? styles.navigationActive : ""}`}
                aria-pressed={view === "gafus"}
                onClick={() => selectView("gafus")}
              >
                Мои Гафусы
              </button>
            )}
          </div>
        </nav>
      )}

      <div
        id={view === "settings" ? "profile-settings" : view === "questions" ? "profile-questions" : view === "notes" ? "profile-notes" : view === "gafus" ? "profile-gafus" : "profile-activity"}
        className={styles.viewContent}
      >
        {view === "settings" && isOwner ? settings : view === "questions" ? questions : view === "notes" && isOwner ? notes : view === "gafus" && isOwner ? wallet : activity}
      </div>
    </>
  );
}
