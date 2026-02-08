"use client";

import styles from "./AccordionStep.module.css";

interface StepPracticeBlockProps {
  stepStatus: string;
  onCompletePractice: () => void;
}

export function StepPracticeBlock({ stepStatus, onCompletePractice }: StepPracticeBlockProps) {
  return (
    <div className={styles.completeAction}>
      {stepStatus !== "COMPLETED" ? (
        <button onClick={onCompletePractice} className={styles.completeBtn}>
          Я выполнил
        </button>
      ) : (
        <div className={styles.completedBadge}>Упражнение выполнено</div>
      )}
    </div>
  );
}
