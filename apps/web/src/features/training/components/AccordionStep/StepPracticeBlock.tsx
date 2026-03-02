"use client";

import styles from "./AccordionStep.module.css";

interface StepPracticeBlockProps {
  stepStatus: string;
  onCompletePractice: () => void;
  isCompleting?: boolean;
}

export function StepPracticeBlock({
  stepStatus,
  onCompletePractice,
  isCompleting = false,
}: StepPracticeBlockProps) {
  return (
    <div className={styles.completeAction}>
      {stepStatus !== "COMPLETED" ? (
        <button
          onClick={onCompletePractice}
          disabled={isCompleting}
          className={styles.completeBtn}
        >
          Я выполнил
        </button>
      ) : (
        <div className={styles.completedBadge}>Упражнение выполнено</div>
      )}
    </div>
  );
}
