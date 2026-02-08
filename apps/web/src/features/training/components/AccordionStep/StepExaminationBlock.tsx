"use client";

import type { ChecklistQuestion } from "@gafus/types";

import { TestQuestions } from "../TestQuestions";
import { VideoReport } from "../VideoReport";
import { WrittenFeedback } from "../WrittenFeedback";

import styles from "./AccordionStep.module.css";

interface StepExaminationBlockProps {
  checklist?: ChecklistQuestion[];
  userStepId?: string;
  stepId: string;
  hasTestQuestions?: boolean;
  requiresWrittenFeedback?: boolean;
  requiresVideoReport?: boolean;
}

function noop() {
  // Колбэки для экзамена: результаты сохраняются внутри дочерних компонентов
}

export function StepExaminationBlock({
  checklist,
  userStepId,
  stepId,
  hasTestQuestions,
  requiresWrittenFeedback,
  requiresVideoReport,
}: StepExaminationBlockProps) {
  return (
    <div className={styles.stepInfo}>
      <div>
        <div className={styles.sectionTitle}>Экзамен:</div>
        <div className={styles.cardSection}>
          {hasTestQuestions && checklist && userStepId && (
            <TestQuestions
              checklist={checklist}
              userStepId={userStepId}
              stepId={stepId}
              onComplete={noop}
              onReset={noop}
            />
          )}
          {requiresWrittenFeedback && userStepId && (
            <WrittenFeedback
              userStepId={userStepId}
              stepId={stepId}
              onComplete={noop}
              onReset={noop}
            />
          )}
          {requiresVideoReport && userStepId && (
            <VideoReport
              userStepId={userStepId}
              stepId={stepId}
              onComplete={noop}
              onReset={noop}
            />
          )}
        </div>
      </div>
    </div>
  );
}
