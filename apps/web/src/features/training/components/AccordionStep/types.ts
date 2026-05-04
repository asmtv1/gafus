import type { ChecklistQuestion, StepType } from "@gafus/types";

export type { StepType };

export interface AccordionStepProps {
  courseId: string;
  courseType: string;
  dayOnCourseId: string;
  stepIndex: number;
  durationSec: number;
  estimatedDurationSec?: number | null;
  stepTitle: string;
  stepDescription?: string;
  stepOrder: number;
  totalSteps: number;
  initialStatus?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED" | "RESET";
  videoUrl?: string | null;
  imageUrls?: string[];
  onRun: (stepIndex: number) => void;
  onReset: (stepIndex: number) => void;
  type?: StepType;
  checklist?: ChecklistQuestion[];
  requiresVideoReport?: boolean;
  requiresWrittenFeedback?: boolean;
  hasTestQuestions?: boolean;
  userStepId?: string;
  stepId: string;
  serverActions?: {
    startStep?: (stepIndex: number, durationSec: number) => Promise<{ success: boolean }>;
    completeStep?: (stepIndex: number) => Promise<{ success: boolean }>;
    pauseStep?: (stepIndex: number, timeLeftSec: number) => Promise<{ success: boolean }>;
    resumeStep?: (stepIndex: number) => Promise<{ success: boolean }>;
    resetStep?: (stepIndex: number) => Promise<{ success: boolean }>;
  };
}
