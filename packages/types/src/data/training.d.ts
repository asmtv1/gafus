import type { TrainingStatus } from "../utils/training-status";
export interface ChecklistQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  comment?: string;
}
export interface Step {
  id: string;
  title: string;
  description: string;
  durationSec: number;
  estimatedDurationSec?: number | null;
  imageUrls: string[];
  pdfUrls: string[];
  videoUrl?: string;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  type?: "TRAINING" | "EXAMINATION" | "THEORY" | "BREAK" | "PRACTICE";
  checklist?: ChecklistQuestion[];
  requiresVideoReport?: boolean;
  requiresWrittenFeedback?: boolean;
  hasTestQuestions?: boolean;
}
export interface TrainingDay {
  id: string;
  title: string;
  description: string;
  type: string;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface StepOnDay {
  id: string;
  dayId: string;
  stepId: string;
  order: number;
  step: Step;
}
export interface DayOnCourse {
  id: string;
  courseId: string;
  dayId: string;
  order: number;
  day: TrainingDay;
}
export interface UserTraining {
  id: string;
  userId: string;
  dayOnCourseId: string;
  status: TrainingStatus;
  currentStepIndex?: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface UserStep {
  id: string;
  userTrainingId: string;
  stepOnDayId: string;
  status: TrainingStatus;
  createdAt: Date;
  updatedAt: Date;
}
export interface TrainingStepProps {
  step: Step;
  index: number;
  userStepId?: string;
  userStepStatus?: TrainingStatus;
  userId: string;
  trainingId: string;
  dayId: string;
}
export interface TrainingDayProps {
  day: TrainingDay;
  dayId: string;
  userId: string;
  trainingId: string;
  courseId: string;
}
//# sourceMappingURL=training.d.ts.map
