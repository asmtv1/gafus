"use client";

import type { DiaryEntry } from "./hooks/useStepDiary";

import styles from "./AccordionStep.module.css";

interface StepDiaryBlockProps {
  diaryContent: string;
  setDiaryContent: (value: string) => void;
  isSavingDiary: boolean;
  diaryError: string | null;
  previousEntries: DiaryEntry[];
  stepStatus: string;
  onSaveDiary: () => void;
}

export function StepDiaryBlock({
  diaryContent,
  setDiaryContent,
  isSavingDiary,
  diaryError,
  previousEntries,
  stepStatus,
  onSaveDiary,
}: StepDiaryBlockProps) {
  return (
    <div className={styles.stepInfo}>
      {stepStatus !== "COMPLETED" ? (
        <>
          <div className={styles.sectionTitle}>Ваша запись:</div>
          <textarea
            className={styles.diaryTextarea}
            value={diaryContent}
            onChange={(e) => setDiaryContent(e.target.value)}
            placeholder="Опишите свои успехи за сегодня..."
            rows={5}
            maxLength={10000}
          />
          {diaryError && (
            <div className={styles.diaryError} role="alert">
              {diaryError}
            </div>
          )}
          <button
            type="button"
            onClick={onSaveDiary}
            disabled={isSavingDiary || !diaryContent.trim()}
            className={styles.completeBtn}
          >
            {isSavingDiary ? "Сохранение…" : "Сохранить"}
          </button>
        </>
      ) : (
        <div className={styles.completedBadge}>Запись сохранена</div>
      )}
      {previousEntries.length > 0 && (
        <>
          <div className={styles.sectionTitle}>Предыдущие записи:</div>
          <ul className={styles.diaryEntriesList}>
            {previousEntries.map((e) => (
              <li key={e.id} className={styles.diaryEntryItem}>
                <strong>
                  День {e.dayOrder}. {e.dayTitle}
                </strong>
                <span className={styles.diaryEntryDate}>
                  {e.createdAt.toLocaleDateString("ru-RU")}
                </span>
                <p className={styles.diaryEntryContent}>{e.content}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
