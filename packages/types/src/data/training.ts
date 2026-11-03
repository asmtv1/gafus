// Типы для тренировок, шагов и дней
import type { TrainingStatus } from "../utils/training-status";
import type { TrainingStep } from "../utils/training";

/** Тип шага тренировки (для Record, хелперов и UI). */
export type StepType =
  | "TRAINING"
  | "EXAMINATION"
  | "THEORY"
  | "BREAK"
  | "PRACTICE"
  | "DIARY"
  | "SURVEY";

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
  videoUrls?: string[];
  authorId: string;
  createdAt: Date;
  updatedAt: Date;

  // Новые поля для типов экзамена
  type?: StepType;
  checklist?: ChecklistQuestion[]; // JSON с тестовыми вопросами
  requiresVideoReport?: boolean;
  requiresWrittenFeedback?: boolean;
  hasTestQuestions?: boolean;
  surveySlug?: string | null;
  isDailyCourse?: boolean;
}

export interface TrainingDay {
  id: string;
  title: string;
  description: string;
  type: string;
  authorId: string;
  showCoursePathExport?: boolean;
  shareProgressAcrossCourses?: boolean;
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

/** Данные персонализации курса (имя, пол, имя питомца, пол питомца, склонения) — ответ getTrainingDays */
export interface UserCoursePersonalization {
  userDisplayName: string;
  userGender: "male" | "female";
  petName: string;
  petGender?: "male" | "female" | null;
  petNameGen?: string | null;
  petNameDat?: string | null;
  petNameAcc?: string | null;
  petNameIns?: string | null;
  petNamePre?: string | null;
}

// Типы для компонентов тренировок
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

/** Existing GET /training/diary JSON, distinct from Core DiaryEntryWithDay Date fields. */
export interface DiaryEntryWire {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  dayId: string;
  dayOnCourseId: string;
  dayOrder: number;
  dayTitle: string;
}

export interface DiaryRead {
  success: true;
  data: { entries: DiaryEntryWire[] };
}

/** Existing GET /training/days day-list JSON; not the Date-valued TrainingDay domain. */
export interface TrainingDaysWireItem {
  trainingDayId: string;
  dayOnCourseId: string;
  title: string;
  type: string;
  courseId: string;
  userStatus: TrainingStatus;
  estimatedDuration: number;
  theoryMinutes: number;
  equipment: string;
  isLocked: boolean;
  showCoursePathExport: boolean;
}

/** Both empty-course and populated GET /training/days response branches. */
export interface TrainingDaysWireData {
  trainingDays: TrainingDaysWireItem[];
  courseDescription: string | null;
  courseId: string | null;
  courseVideoUrl: string | null;
  courseEquipment: string | null;
  courseTrainingLevel: string | null;
  courseIsPersonalized: boolean;
  userCoursePersonalization: UserCoursePersonalization | null;
}

export interface TrainingDaysRead {
  success: true;
  data: TrainingDaysWireData;
}

/** Existing GET /api/v1/daily-course/today JSON, not the mutable Core domain. */
export interface TodayDailyCourseWire {
  mskDate: string;
  scheduleId: string | null;
  /** Declared Core TrainingStatus; not a claim that every enum member is reachable. */
  userStatus: TrainingStatus;
  day: {
    id: string;
    title: string;
    description: string;
    type: string;
    estimatedDuration: number;
    theoryMinutes: number;
    stepsCount: number;
  } | null;
  stepsSummary: {
    total: number;
    completed: number;
  };
}

/** Existing /today 200 Hono success envelope (not the /day contract). */
export interface TodayDailyCourseRead {
  success: true;
  data: TodayDailyCourseWire;
}

/**
 * Full existing GET /api/v1/training/day JSON payload. This is NOT the
 * partial Mobile/offline TrainingDayResponse or the /training/days list.
 * Original Core TrainingDetail contains no Date-valued fields: no fabricated
 * timestamps or JSON date conversion are necessary for this endpoint.
 * `checklist` retains the existing TrainingStep slot, whose domain type is
 * not narrowed here without an independently approved source contract.
 */
export interface TrainingDayStepWire {
  id: string;
  videoUrl: string | null;
  videoUrls?: string[];
  pdfUrls?: string[];
  imageUrls?: string[];
  title: string;
  description: string;
  durationSec: number;
  estimatedDurationSec?: number | null;
  status: TrainingStatus;
  order: number;
  isPausedOnServer?: boolean;
  remainingSecOnServer?: number;
  type?: "TRAINING" | "EXAMINATION" | "THEORY" | "BREAK" | "PRACTICE" | "DIARY" | "SURVEY";
  checklist?: TrainingStep["checklist"];
  requiresVideoReport?: boolean;
  requiresWrittenFeedback?: boolean;
  hasTestQuestions?: boolean;
  surveySlug?: string | null;
  userStepId?: string;
  locked?: boolean;
  monetizationTarget?: { targetType: "COURSE_STEP"; targetId: string };
}

export interface TrainingDayWire {
  trainingDayId: string;
  dayOnCourseId: string;
  displayDayNumber?: number | null;
  title: string;
  type: string;
  showCoursePathExport?: boolean;
  courseId: string;
  description: string;
  duration: string;
  userStatus: TrainingStatus;
  steps: TrainingDayStepWire[];
}

/** The successful found branch; missing/forbidden stay HTTP 404/403. */
export interface TrainingDayRead {
  success: true;
  data: TrainingDayWire;
}

/**
 * Complete existing GET /api/v1/daily-course/day JSON, distinct from
 * /daily-course/today, /training/day, and partial Web/Mobile projections.
 * The Core mapper already emits `completedAt` as ISO string or null.
 * Other raw updatedAt Date values used internally are NOT in this response.
 */
export interface DailyCourseDayStepWire {
  id: string;
  stepId: string;
  stepIndex: number;
  status: TrainingStatus;
  remainingSec: number | null;
  completedAt: string | null;
  isPausedOnServer: boolean;
  remainingSecOnServer?: number;
  step: {
    id: string;
    title: string;
    description: string;
    type: string;
    durationSec: number | null;
    estimatedDurationSec: number | null;
    videoUrl: string | null;
    imageUrls: string[];
    pdfUrls: string[];
    checklist: ChecklistQuestion[] | null;
    requiresVideoReport: boolean;
    requiresWrittenFeedback: boolean;
    hasTestQuestions: boolean;
    surveySlug: string | null;
    order: number;
  };
}

export interface DailyCourseDayWire {
  scheduleId: string;
  mskDate: string;
  trainingDayId: string;
  bundleId: string;
  title: string;
  description: string;
  type: string;
  userStatus: TrainingStatus;
  steps: DailyCourseDayStepWire[];
}

/** Existing successful 200 only; absent/unpublished days remain 404. */
export interface DailyCourseDayRead {
  success: true;
  data: DailyCourseDayWire;
}

/** Negotiated Web-only stable occurrence contract. Never send to legacy/native GET. */
export type DailyCourseBoundStepWire = DailyCourseDayStepWire & {
  bundleStepId: string;
  /** Server-authored snapshot from persisted updatedAt and remainingSec. */
  timerSnapshot?: { remainingSecAtServerNow: number | null; expiresAt: string | null };
};
export type DailyCourseBoundDayWire = Omit<DailyCourseDayWire, "steps"> & {
  onlineStepBinding: "BUNDLE_STEP_ID_V1";
  serverNow?: string;
  steps: DailyCourseBoundStepWire[];
};
export interface DailyCourseBoundDayRead {
  success: true;
  data: DailyCourseBoundDayWire;
}
