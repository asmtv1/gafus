"use client";

import { memo, useCallback, useState, useTransition } from "react";
import dynamic from "next/dynamic";

import { getStepDisplayStatus, STEP_STATUS_LABELS } from "@gafus/core/utils/training";
import { TrainingStatus, type TrainingDetail } from "@gafus/types";
import { reportClientError } from "@gafus/error-handling";
import { AppSubscriptionPaywall } from "@/features/app-subscription/components/AppSubscriptionPaywall";
import { useStepState, useStepStore } from "@shared/stores/stepStore";
import { markTheoryStepAsCompleted } from "@shared/lib/training/markTheoryStepAsCompleted";
import { ExpandMoreIcon } from "@shared/utils/muiImports";

import styles from "./Day.module.css";

const AccordionStep = dynamic(() => import("../AccordionStep").then((mod) => mod.AccordionStep), {
  ssr: false,
});

const STEP_STATUS_CONFIG = {
  NOT_STARTED: { emoji: "⏳", backgroundColor: "#FFF8E5" },
  IN_PROGRESS: { emoji: "🔄", backgroundColor: "#E6F3FF" },
  COMPLETED: { emoji: "✅", backgroundColor: "#B6C582" },
  PAUSED: { emoji: "⏸️", backgroundColor: "#FFF4E6" },
  RESET: { emoji: "🔄", backgroundColor: "#E8E6E6" },
} as const;

interface DayAccordionItemProps {
  training: TrainingDetail;
  courseType: string;
  index: number;
  step: TrainingDetail["steps"][number];
  openIndex: number | null;
  onOpenChange: (newOpenIndex: number | null) => void;
  onStepStart: (stepIndex: number) => void;
  onReset: (stepIndex: number) => void;
  serverActions?: {
    startStep?: (stepIndex: number, durationSec: number) => Promise<{ success: boolean }>;
    completeStep?: (stepIndex: number) => Promise<{ success: boolean }>;
    pauseStep?: (stepIndex: number, timeLeftSec: number) => Promise<{ success: boolean }>;
    resumeStep?: (stepIndex: number) => Promise<{ success: boolean }>;
    resetStep?: (stepIndex: number) => Promise<{ success: boolean }>;
    unlockStep?: (stepIndex: number) => Promise<{ success: boolean; reason?: "PAYWALL" }>;
  };
}

export const DayAccordionItem = memo(function DayAccordionItem({
  training,
  courseType,
  index,
  step,
  openIndex,
  onOpenChange,
  onStepStart,
  onReset,
  serverActions,
}: DayAccordionItemProps) {
  const stepState = useStepState(training.courseId, training.dayOnCourseId, index);
  const updateStepStatus = useStepStore((s) => s.updateStepStatus);
  const [isPending, startTheoryTransition] = useTransition();
  const [paywallOpen, setPaywallOpen] = useState(false);

  const isBreakStep = step.type === "BREAK";
  const isDiaryStep = step.type === "DIARY";
  const stepStatus = getStepDisplayStatus(stepState, step);
  const statusConfig =
    STEP_STATUS_CONFIG[stepStatus as keyof typeof STEP_STATUS_CONFIG] ??
    STEP_STATUS_CONFIG.NOT_STARTED;
  const statusText =
    STEP_STATUS_LABELS[stepStatus as TrainingStatus] ??
    STEP_STATUS_LABELS[TrainingStatus.NOT_STARTED];

  const handleClick = useCallback(() => {
    const newOpenIndex: number | null = openIndex === index ? null : index;
    if (newOpenIndex !== null && step.locked) {
      if (!serverActions?.unlockStep) {
        setPaywallOpen(true);
        return;
      }
      startTheoryTransition(async () => {
        try {
          const result = await serverActions.unlockStep?.(index);
          if (result?.success) {
            window.location.reload();
            return;
          }
          if (result?.reason === "PAYWALL") {
            setPaywallOpen(true);
          }
        } catch (e) {
          reportClientError(e, {
            issueKey: "DayAccordionItem",
            keys: { step: "unlockStep", stepIndex: index, courseId: training.courseId },
          });
          setPaywallOpen(true);
        }
      });
      return;
    }
    onOpenChange(newOpenIndex);

    if (newOpenIndex !== null) {
      const currentStatus = getStepDisplayStatus(stepState, step);
      if (step.type === "THEORY" && currentStatus === TrainingStatus.NOT_STARTED) {
        startTheoryTransition(async () => {
          try {
            if (serverActions?.completeStep) {
              await serverActions.completeStep(index);
            } else {
              await markTheoryStepAsCompleted(
                training.courseId,
                training.dayOnCourseId,
                index,
                step.title,
                step.order,
              );
            }
            updateStepStatus(training.courseId, training.dayOnCourseId, index, "COMPLETED");
          } catch (e) {
            reportClientError(e, {
              issueKey: "DayAccordionItem",
              keys: {
                step: "markTheoryStepAsCompleted",
                stepIndex: index,
                courseId: training.courseId,
              },
            });
          }
        });
      }
    }
  }, [
    openIndex,
    index,
    onOpenChange,
    training,
    step,
    stepState,
    updateStepStatus,
    startTheoryTransition,
    serverActions,
  ]);

  return (
    <div key={`${step.id}-${index}`} className={styles.accordionItem}>
      <div
        className={styles.accordionHeader}
        onClick={handleClick}
        style={{ backgroundColor: statusConfig.backgroundColor }}
      >
        <div className={styles.stepTitleContainer}>
          <div className={styles.expandControl}>
            <ExpandMoreIcon
              className={`${styles.expandIcon} ${openIndex === index ? styles.expanded : ""}`}
            />
            <span className={styles.expandText}>
              {isPending
                ? "Открываем"
                : step.locked
                  ? "Открыть"
                  : openIndex === index
                    ? "Скрыть"
                    : "Подробнее"}
            </span>
          </div>
          <h3 className={styles.stepTitle}>
            <div className={styles.stepTitleText}>
              {(isBreakStep || isDiaryStep) && (
                <span>{isBreakStep ? "Перерыв" : "Дневник успехов"}</span>
              )}
              <span>{step.type === "BREAK" ? step.title : `«${step.title}»`}</span>
            </div>
          </h3>
          <div className={styles.stepStatusConfig}>
            <span>
              {statusConfig.emoji} {statusText}
            </span>
          </div>
        </div>
      </div>
      {openIndex === index && (
        <div className={styles.accordionContent}>
          <AccordionStep
            courseId={training.courseId}
            courseType={courseType}
            dayOnCourseId={training.dayOnCourseId}
            stepIndex={index}
            durationSec={step.durationSec}
            estimatedDurationSec={step.estimatedDurationSec ?? null}
            stepTitle={step.title}
            stepDescription={step.description}
            stepOrder={step.order}
            totalSteps={training.steps.length}
            initialStatus={step.status}
            videoUrl={step.videoUrl}
            imageUrls={step.imageUrls}
            onRun={onStepStart}
            onReset={onReset}
            type={step.type}
            checklist={step.checklist}
            requiresVideoReport={step.requiresVideoReport}
            requiresWrittenFeedback={step.requiresWrittenFeedback}
            hasTestQuestions={step.hasTestQuestions}
            surveySlug={step.surveySlug}
            userStepId={step.userStepId}
            stepId={step.id}
            serverActions={serverActions}
          />
        </div>
      )}
      {paywallOpen ? (
        <div
          className={styles.paywallOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Доступ к шагу"
        >
          <div className={styles.paywallPanel}>
            <AppSubscriptionPaywall mode="embedded" onClose={() => setPaywallOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
});
