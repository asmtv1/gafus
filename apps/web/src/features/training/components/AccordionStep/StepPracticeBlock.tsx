"use client";

import styles from "./AccordionStep.module.css";
import { PrimaryButton } from "@/shared/components/ui";

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
        <PrimaryButton
          onClick={onCompletePractice}
          disabled={isCompleting}
          className={styles.completeBtn}
        >
          Я выполнил
        </PrimaryButton>
      ) : (
        <div className={styles.completedBadge}>Упражнение выполнено</div>
      )}
    </div>
  );
}
