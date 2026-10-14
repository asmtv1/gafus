import { isPrismaUniqueConstraintError, prisma } from "@gafus/prisma";
import type {
  Prisma,
  StepType as PrismaStepType,
  TrainingStatus as PrismaTrainingStatus,
} from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { TrainingStatus, calculateDayStatusFromStatuses } from "@gafus/types";
import type { ChecklistQuestion } from "@gafus/types";
import { randomUUID } from "crypto";
import { estimateDayDurations } from "../../utils/training";
import { invalidateStepsContentCache } from "../training/trainingDayContent";
import { publishCourseContentChange } from "../training/trainingContentRevision";
import {
  parseDailyCourseImportFile,
  type ParsedDailyCourseImportDay,
  type ParsedDailyCourseImportFile,
} from "./importParser";
import {
  dailyCourseRangeSchema,
  upsertDailyCourseScheduleSchema,
  deleteDailyCourseScheduleSchema,
  upsertDailyCourseBundleSchema,
  deleteDailyCourseBundleSchema,
  type DailyCourseRangeInput,
  type UpsertDailyCourseScheduleInput,
  type UpsertDailyCourseBundleInput,
} from "./schemas";

const logger = createWebLogger("daily-course");

const ALLOWED_ROLES = new Set(["TRAINER", "ADMIN", "MODERATOR"]);
const ADMIN_ROLES = new Set(["ADMIN", "MODERATOR"]);
const ALLOWED_STEP_TYPES = new Set([
  "TRAINING",
  "PRACTICE",
  "THEORY",
  "BREAK",
  "EXAMINATION",
  "SURVEY",
]);
const NON_EXAMINATION_STEP_TYPES: PrismaStepType[] = [
  "TRAINING",
  "PRACTICE",
  "THEORY",
  "BREAK",
  "SURVEY",
];
const MIN_STEPS = 2;
const MAX_STEPS = 5;
const MAX_DAILY_COURSE_TIMER_SEC = 24 * 60 * 60;

export type DailyCourseStepOperation =
  | { type: "start"; remainingSec?: number }
  | { type: "pause"; remainingSec: number }
  | { type: "resume" }
  | { type: "reset" }
  | { type: "complete" };

export interface DailyCourseActor {
  id: string;
  role: string;
}

export interface DailyCourseStepDto {
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

export interface TodayDailyCourseResponse {
  mskDate: string;
  scheduleId: string | null;
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

export interface DailyCourseDayResponse {
  scheduleId: string;
  mskDate: string;
  trainingDayId: string;
  bundleId: string;
  title: string;
  description: string;
  type: string;
  userStatus: TrainingStatus;
  steps: DailyCourseStepDto[];
}

export interface DailyCourseScheduleDto {
  id: string;
  date: string;
  isPublished: boolean;
  bundle: {
    id: string;
    title: string;
    type: string;
    stepsCount: number;
  };
  createdBy: {
    id: string;
    username: string;
  };
}

export interface DailyCourseCandidateDto {
  id: string;
  title: string;
  type: string;
  stepsCount: number;
  authorId: string;
  authorUsername: string;
}

export interface DailyCourseBundleDto extends DailyCourseCandidateDto {
  equipment: string;
  description: string;
  steps: {
    id: string;
    title: string;
    type: string;
    order: number;
  }[];
}

export interface DailyCourseStepCandidateDto {
  id: string;
  title: string;
  type: string;
  durationSec: number | null;
  authorId: string;
  authorUsername: string;
}

export interface DailyCourseStatisticsStepDto {
  bundleStepId: string;
  stepId: string;
  title: string;
  order: number;
  status: TrainingStatus;
  paused: boolean;
  remainingSec: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface DailyCourseStatisticsUserDto {
  userId: string;
  username: string;
  openedAt: Date;
  status: TrainingStatus;
  completedSteps: number;
  totalSteps: number;
  lastActivityAt: Date;
  currentStepTitle: string | null;
  steps: DailyCourseStatisticsStepDto[];
}

export interface DailyCourseScheduleStatisticsDto {
  scheduleId: string;
  mskDate: string;
  bundleId: string;
  title: string;
  totalSteps: number;
  summary: {
    openedUsers: number;
    startedUsers: number;
    completedUsers: number;
    openedWithoutStartUsers: number;
  };
  users: DailyCourseStatisticsUserDto[];
}

export interface DailyCourseImportConflictDto {
  scheduleId: string;
  bundleTitle: string;
  isPublished: boolean;
}

export interface DailyCourseImportPreviewDayDto extends ParsedDailyCourseImportDay {
  isPast: boolean;
  conflict: DailyCourseImportConflictDto | null;
  canReplaceConflict: boolean;
  canImport: boolean;
}

export interface DailyCourseImportPreviewDto {
  days: DailyCourseImportPreviewDayDto[];
  hasErrors: boolean;
  summary: {
    totalDays: number;
    emptyDays: number;
    importableDays: number;
    conflictDays: number;
    errorDays: number;
  };
}

export interface DailyCourseImportResultDto {
  preview: DailyCourseImportPreviewDto;
  importedDates: string[];
  skippedDates: { date: string; reason: string }[];
}

export type DailyCourseCleanupMode = "future" | "all";

export interface DailyCourseCleanupSkippedStepDto {
  id: string;
  title: string;
  reason: "REGULAR_COURSE_LINK" | "SHARED_DAILY_BUNDLE_LINK";
}

export interface DailyCourseCleanupPreviewDto {
  mode: DailyCourseCleanupMode;
  schedulesToDelete: number;
  bundlesToDelete: number;
  stepsToDelete: number;
  skippedSteps: DailyCourseCleanupSkippedStepDto[];
  userTrainingsToDelete: number;
  userStepsToDelete: number;
}

export interface DailyCourseCleanupResultDto {
  preview: DailyCourseCleanupPreviewDto;
  deleted: {
    schedules: number;
    bundles: number;
    steps: number;
  };
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type StepLinkForDailyCourse = {
  id: string;
  order: number;
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
    checklist: unknown;
    requiresVideoReport: boolean;
    requiresWrittenFeedback: boolean;
    hasTestQuestions: boolean;
    surveySlug: string | null;
    isDailyCourse: boolean;
  };
};

const DAILY_COURSE_CLEANUP_CONFIRMATION = "ОЧИСТИТЬ КУРС ДНЯ";

function assertCanManageDailyCourse(actor: DailyCourseActor): void {
  if (!ALLOWED_ROLES.has(actor.role)) {
    throw new Error("FORBIDDEN");
  }
}

function isElevated(actor: DailyCourseActor): boolean {
  return ADMIN_ROLES.has(actor.role);
}

export function getMoscowDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Не удалось определить московскую дату");
  }
  return `${year}-${month}-${day}`;
}

export { parseDailyCourseImportFile };

function dateKeyToDate(dateKey: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("INVALID_DATE");
  }
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getTodayDate(): Date {
  return dateKeyToDate(getMoscowDateKey());
}

function mapStepStatus(status: string | null | undefined): TrainingStatus {
  return (status as TrainingStatus | undefined) ?? TrainingStatus.NOT_STARTED;
}

function validateDailyCourseStepLinks(stepLinks: StepLinkForDailyCourse[]): void {
  if (stepLinks.length < MIN_STEPS || stepLinks.length > MAX_STEPS) {
    throw new Error("DAILY_COURSE_INVALID_STEPS_COUNT");
  }

  for (const link of stepLinks) {
    const step = link.step;
    if (!ALLOWED_STEP_TYPES.has(step.type)) {
      throw new Error("DAILY_COURSE_INVALID_STEP_TYPE");
    }
    if (
      step.type !== "EXAMINATION" &&
      (step.requiresVideoReport || step.requiresWrittenFeedback || step.hasTestQuestions)
    ) {
      throw new Error("DAILY_COURSE_INVALID_REPORT_STEP");
    }
    if (!step.isDailyCourse) {
      throw new Error("DAILY_COURSE_INVALID_STEP_SCOPE");
    }
  }
}

function validateRemainingSec(remainingSec: number | undefined, durationSec: number | null): void {
  if (remainingSec === undefined) return;
  if (!Number.isInteger(remainingSec) || remainingSec < 0) {
    throw new Error("INVALID_TIMER");
  }
  const maxRemainingSec = durationSec && durationSec > 0 ? durationSec : MAX_DAILY_COURSE_TIMER_SEC;
  if (remainingSec > maxRemainingSec) {
    throw new Error("INVALID_TIMER");
  }
}

async function getValidatedDailyCourseBundle(bundleId: string, actor?: DailyCourseActor) {
  const bundle = await prisma.dailyCourseBundle.findUnique({
    where: { id: bundleId },
    select: {
      id: true,
      title: true,
      type: true,
      authorId: true,
      author: { select: { username: true } },
      stepLinks: {
        orderBy: { order: "asc" },
        select: dailyCourseBundleStepSelect,
      },
    },
  });

  if (!bundle) {
    throw new Error("DAILY_COURSE_BUNDLE_NOT_FOUND");
  }
  if (actor && !isElevated(actor) && bundle.authorId !== actor.id) {
    throw new Error("FORBIDDEN");
  }
  validateDailyCourseStepLinks(bundle.stepLinks);
  return bundle;
}

const dailyCourseBundleStepSelect = {
  id: true,
  order: true,
  step: {
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      durationSec: true,
      estimatedDurationSec: true,
      videoUrl: true,
      imageUrls: true,
      pdfUrls: true,
      checklist: true,
      requiresVideoReport: true,
      requiresWrittenFeedback: true,
      hasTestQuestions: true,
      surveySlug: true,
      isDailyCourse: true,
    },
  },
} as const;

async function ensureDailyCourseUserTrainingExists(
  userId: string,
  scheduleId: string,
): Promise<string> {
  try {
    const training = await prisma.dailyCourseUserTraining.upsert({
      where: { userId_scheduleId: { userId, scheduleId } },
      create: { userId, scheduleId, status: TrainingStatus.NOT_STARTED },
      update: {},
      select: { id: true },
    });
    return training.id;
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      const existing = await prisma.dailyCourseUserTraining.findUnique({
        where: { userId_scheduleId: { userId, scheduleId } },
        select: { id: true },
      });
      if (!existing?.id) {
        throw new Error("Failed to create or find DailyCourseUserTraining");
      }
      return existing.id;
    }
    throw error;
  }
}

function mapDailyCourseSteps(
  stepLinks: StepLinkForDailyCourse[],
  userSteps: {
    id: string;
    bundleStepId: string;
    status: string;
    paused: boolean;
    remainingSec: number | null;
    updatedAt: Date;
  }[],
): DailyCourseStepDto[] {
  const byBundleStepId = new Map(userSteps.map((step) => [step.bundleStepId, step]));
  return stepLinks.map((link, index) => {
    const userStep = byBundleStepId.get(link.id);
    const status = mapStepStatus(userStep?.status);
    return {
      id: userStep?.id ?? link.step.id,
      stepId: link.step.id,
      stepIndex: index,
      status,
      remainingSec: userStep?.remainingSec ?? null,
      completedAt:
        status === TrainingStatus.COMPLETED && userStep ? userStep.updatedAt.toISOString() : null,
      isPausedOnServer: Boolean(userStep?.paused),
      remainingSecOnServer: userStep?.remainingSec ?? undefined,
      step: {
        id: link.step.id,
        title: link.step.title,
        description: cleanDailyCourseMarkdownDescription(link.step.description),
        type: link.step.type,
        durationSec: link.step.durationSec,
        estimatedDurationSec: link.step.estimatedDurationSec,
        videoUrl: link.step.videoUrl,
        imageUrls: link.step.imageUrls,
        pdfUrls: link.step.pdfUrls,
        checklist: Array.isArray(link.step.checklist)
          ? (link.step.checklist as ChecklistQuestion[])
          : null,
        requiresVideoReport: link.step.requiresVideoReport,
        requiresWrittenFeedback: link.step.requiresWrittenFeedback,
        hasTestQuestions: link.step.hasTestQuestions,
        surveySlug: link.step.surveySlug,
        order: link.order,
      },
    };
  });
}

function cleanDailyCourseMarkdownDescription(description: string): string {
  const trimmed = description.trim();
  const unquoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"')))
      ? trimmed.slice(1, -1).trim()
      : trimmed;
  const fenced = unquoted.match(/^`{2,3}[a-z0-9_-]*\s*\n([\s\S]*?)\n`{2,3}$/i);
  return fenced ? fenced[1].trim() : description;
}

function calculateDailyCourseUserStatus(
  stepLinks: { id: string }[],
  userSteps: { bundleStepId: string; status: string }[],
): TrainingStatus {
  const byBundleStepId = new Map(userSteps.map((step) => [step.bundleStepId, step.status]));
  const statuses = stepLinks.map(
    (link) => byBundleStepId.get(link.id) ?? TrainingStatus.NOT_STARTED,
  );
  return calculateDayStatusFromStatuses(statuses);
}

export async function getTodayDailyCourse(
  userId: string,
  now = new Date(),
): Promise<TodayDailyCourseResponse> {
  const mskDate = getMoscowDateKey(now);
  const schedule = await prisma.dailyCourseSchedule.findUnique({
    where: { date: dateKeyToDate(mskDate) },
    select: {
      id: true,
      date: true,
      isPublished: true,
      bundle: {
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          stepLinks: {
            orderBy: { order: "asc" },
            select: dailyCourseBundleStepSelect,
          },
        },
      },
      userTrainings: {
        where: { userId },
        select: {
          steps: { select: { bundleStepId: true, status: true } },
        },
        take: 1,
      },
    },
  });

  if (!schedule || !schedule.isPublished) {
    return {
      mskDate,
      scheduleId: null,
      day: null,
      userStatus: TrainingStatus.NOT_STARTED,
      stepsSummary: { total: 0, completed: 0 },
    };
  }

  const stepLinks = schedule.bundle.stepLinks;
  const userSteps = schedule.userTrainings[0]?.steps ?? [];
  const userStatus = calculateDailyCourseUserStatus(stepLinks, userSteps);
  const durations = estimateDayDurations(stepLinks.map((link) => link.step));
  const completed = userSteps.filter((step) => step.status === TrainingStatus.COMPLETED).length;

  return {
    mskDate,
    scheduleId: schedule.id,
    userStatus,
    day: {
      id: schedule.bundle.id,
      title: schedule.bundle.title,
      description: schedule.bundle.description,
      type: schedule.bundle.type,
      estimatedDuration: durations.trainingMinutes,
      theoryMinutes: durations.theoryMinutes,
      stepsCount: stepLinks.length,
    },
    stepsSummary: { total: stepLinks.length, completed },
  };
}

export async function getDailyCourseDayWithUserSteps(
  userId: string,
  scheduleId: string,
  options?: { createIfMissing?: boolean },
): Promise<DailyCourseDayResponse | null> {
  const schedule = await prisma.dailyCourseSchedule.findFirst({
    where: { id: scheduleId, isPublished: true, date: { lte: getTodayDate() } },
    select: {
      id: true,
      date: true,
      bundle: {
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          stepLinks: {
            orderBy: { order: "asc" },
            select: dailyCourseBundleStepSelect,
          },
        },
      },
      userTrainings: {
        where: { userId },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!schedule) return null;

  let userTrainingId = schedule.userTrainings[0]?.id;
  if (!userTrainingId && options?.createIfMissing) {
    userTrainingId = await ensureDailyCourseUserTrainingExists(userId, schedule.id);
  }

  const stepLinks = schedule.bundle.stepLinks;
  const userSteps = userTrainingId
    ? await prisma.dailyCourseUserStep.findMany({
        where: { dailyCourseUserTrainingId: userTrainingId },
        select: {
          id: true,
          bundleStepId: true,
          status: true,
          paused: true,
          remainingSec: true,
          updatedAt: true,
        },
      })
    : [];

  if (userTrainingId) {
    const existing = new Set(userSteps.map((step) => step.bundleStepId));
    const missing = stepLinks.filter((link) => !existing.has(link.id));
    if (missing.length > 0) {
      const created = await prisma.$transaction(async (tx) =>
        Promise.all(
          missing.map((link) =>
            tx.dailyCourseUserStep.create({
              data: {
                dailyCourseUserTrainingId: userTrainingId!,
                bundleStepId: link.id,
                status: TrainingStatus.NOT_STARTED,
              },
              select: {
                id: true,
                bundleStepId: true,
                status: true,
                paused: true,
                remainingSec: true,
                updatedAt: true,
              },
            }),
          ),
        ),
      );
      userSteps.push(...created);
    }
  }

  const userStatus = calculateDailyCourseUserStatus(stepLinks, userSteps);

  return {
    scheduleId: schedule.id,
    mskDate: toDateKey(schedule.date),
    trainingDayId: schedule.bundle.id,
    bundleId: schedule.bundle.id,
    title: schedule.bundle.title,
    description: schedule.bundle.description,
    type: schedule.bundle.type,
    userStatus,
    steps: mapDailyCourseSteps(stepLinks, userSteps),
  };
}

export async function updateDailyCourseStepAndDay(
  userId: string,
  scheduleId: string,
  stepIndex: number,
  operation: DailyCourseStepOperation,
): Promise<{ allCompleted: boolean; stepJustCompleted: boolean }> {
  return prisma.$transaction(
    async (tx: Tx) => {
      const schedule = await tx.dailyCourseSchedule.findFirst({
        where: { id: scheduleId, isPublished: true, date: { lte: getTodayDate() } },
        select: {
          id: true,
          bundle: {
            select: {
              stepLinks: {
                orderBy: { order: "asc" },
                select: { id: true, step: { select: { durationSec: true } } },
              },
            },
          },
        },
      });

      if (!schedule) {
        throw new Error("SCHEDULE_NOT_FOUND");
      }

      const stepLink = schedule.bundle.stepLinks[stepIndex];
      if (!stepLink) {
        throw new Error("STEP_NOT_FOUND");
      }
      if (operation.type === "start" || operation.type === "pause") {
        validateRemainingSec(operation.remainingSec, stepLink.step.durationSec);
      }

      const userTraining = await tx.dailyCourseUserTraining.upsert({
        where: { userId_scheduleId: { userId, scheduleId } },
        create: { userId, scheduleId, status: TrainingStatus.NOT_STARTED },
        update: {},
        select: { id: true },
      });

      const existingStep = await tx.dailyCourseUserStep.findFirst({
        where: { dailyCourseUserTrainingId: userTraining.id, bundleStepId: stepLink.id },
        select: { id: true, status: true },
      });

      if (
        (operation.type === "pause" || operation.type === "resume" || operation.type === "reset") &&
        !existingStep
      ) {
        throw new Error("STEP_NOT_FOUND");
      }

      if (operation.type === "reset" && existingStep?.status === TrainingStatus.NOT_STARTED) {
        throw new Error("INVALID_STATE: cannot reset not started");
      }

      let stepJustCompleted = false;

      switch (operation.type) {
        case "start":
          if (existingStep) {
            {
              const result = await tx.dailyCourseUserStep.updateMany({
                where: {
                  id: existingStep.id,
                  status: {
                    in: [
                      TrainingStatus.NOT_STARTED,
                      TrainingStatus.RESET,
                      TrainingStatus.IN_PROGRESS,
                    ],
                  },
                },
                data: {
                  status: TrainingStatus.IN_PROGRESS,
                  paused: false,
                  remainingSec: operation.remainingSec ?? 0,
                },
              });
              if (result.count === 0) throw new Error("INVALID_STATE: cannot start completed");
            }
          } else {
            try {
              await tx.dailyCourseUserStep.create({
                data: {
                  dailyCourseUserTrainingId: userTraining.id,
                  bundleStepId: stepLink.id,
                  status: TrainingStatus.IN_PROGRESS,
                  paused: false,
                  remainingSec: operation.remainingSec ?? 0,
                },
              });
            } catch (error) {
              if (!isPrismaUniqueConstraintError(error)) throw error;
              const result = await tx.dailyCourseUserStep.updateMany({
                where: {
                  dailyCourseUserTrainingId: userTraining.id,
                  bundleStepId: stepLink.id,
                  status: {
                    in: [
                      TrainingStatus.NOT_STARTED,
                      TrainingStatus.RESET,
                      TrainingStatus.IN_PROGRESS,
                    ],
                  },
                },
                data: {
                  status: TrainingStatus.IN_PROGRESS,
                  paused: false,
                  remainingSec: operation.remainingSec ?? 0,
                },
              });
              if (result.count === 0) throw new Error("INVALID_STATE: cannot start completed");
            }
          }
          break;
        case "pause": {
          const result = await tx.dailyCourseUserStep.updateMany({
            where: { id: existingStep!.id, status: TrainingStatus.IN_PROGRESS, paused: false },
            data: { paused: true, remainingSec: operation.remainingSec },
          });
          if (result.count === 0) throw new Error("INVALID_STATE: cannot pause step");
          break;
        }
        case "resume": {
          const result = await tx.dailyCourseUserStep.updateMany({
            where: { id: existingStep!.id, status: TrainingStatus.IN_PROGRESS, paused: true },
            data: { paused: false },
          });
          if (result.count === 0) throw new Error("INVALID_STATE: cannot resume step");
          break;
        }
        case "reset": {
          const result = await tx.dailyCourseUserStep.updateMany({
            where: {
              id: existingStep!.id,
              status: { in: [TrainingStatus.IN_PROGRESS, TrainingStatus.COMPLETED] },
            },
            data: { status: TrainingStatus.RESET, paused: false, remainingSec: null },
          });
          if (result.count === 0) throw new Error("INVALID_STATE: cannot reset step");
          break;
        }
        case "complete":
          if (existingStep) {
            const result = await tx.dailyCourseUserStep.updateMany({
              where: { id: existingStep.id, status: { not: TrainingStatus.COMPLETED } },
              data: { status: TrainingStatus.COMPLETED, paused: false, remainingSec: null },
            });
            stepJustCompleted = result.count > 0;
          } else {
            try {
              await tx.dailyCourseUserStep.create({
                data: {
                  dailyCourseUserTrainingId: userTraining.id,
                  bundleStepId: stepLink.id,
                  status: TrainingStatus.COMPLETED,
                },
              });
              stepJustCompleted = true;
            } catch (error) {
              if (!isPrismaUniqueConstraintError(error)) throw error;
              const result = await tx.dailyCourseUserStep.updateMany({
                where: {
                  dailyCourseUserTrainingId: userTraining.id,
                  bundleStepId: stepLink.id,
                  status: { not: TrainingStatus.COMPLETED },
                },
                data: { status: TrainingStatus.COMPLETED, paused: false, remainingSec: null },
              });
              stepJustCompleted = result.count > 0;
            }
          }
          break;
      }

      const userSteps = await tx.dailyCourseUserStep.findMany({
        where: { dailyCourseUserTrainingId: userTraining.id },
        select: { bundleStepId: true, status: true },
      });
      const statusByBundleStepId = new Map(
        userSteps.map((step) => [step.bundleStepId, step.status]),
      );
      const allStatuses = schedule.bundle.stepLinks.map(
        (link) => statusByBundleStepId.get(link.id) ?? TrainingStatus.NOT_STARTED,
      );
      const correctedStatus = calculateDayStatusFromStatuses(allStatuses);
      const allCompleted = correctedStatus === TrainingStatus.COMPLETED;
      const nextCurrentStepIndex = allCompleted
        ? schedule.bundle.stepLinks.length - 1
        : allStatuses.findIndex((status) => status !== TrainingStatus.COMPLETED);

      await tx.dailyCourseUserTraining.update({
        where: { id: userTraining.id },
        data: {
          status: correctedStatus as PrismaTrainingStatus,
          currentStepIndex: nextCurrentStepIndex < 0 ? 0 : nextCurrentStepIndex,
        },
      });

      return { allCompleted, stepJustCompleted };
    },
    { timeout: 10000 },
  );
}

export async function getDailyCourseScheduleStatistics(
  actor: DailyCourseActor,
  input: { scheduleId: string },
): Promise<DailyCourseScheduleStatisticsDto | null> {
  assertCanManageDailyCourse(actor);

  const schedule = await prisma.dailyCourseSchedule.findFirst({
    where: {
      id: input.scheduleId,
      ...(isElevated(actor) ? {} : { bundle: { authorId: actor.id } }),
    },
    select: {
      id: true,
      date: true,
      bundle: {
        select: {
          id: true,
          title: true,
          authorId: true,
          stepLinks: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              order: true,
              step: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
        },
      },
      userTrainings: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          userId: true,
          status: true,
          currentStepIndex: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              username: true,
            },
          },
          steps: {
            select: {
              id: true,
              bundleStepId: true,
              status: true,
              paused: true,
              remainingSec: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  });

  if (!schedule) return null;

  const totalSteps = schedule.bundle.stepLinks.length;
  const users = schedule.userTrainings
    .map((training): DailyCourseStatisticsUserDto => {
      const userStepByBundleStepId = new Map(
        training.steps.map((step) => [step.bundleStepId, step]),
      );
      const orderedSteps = schedule.bundle.stepLinks.map((link): DailyCourseStatisticsStepDto => {
        const userStep = userStepByBundleStepId.get(link.id);
        return {
          bundleStepId: link.id,
          stepId: link.step.id,
          title: link.step.title,
          order: link.order,
          status: mapStepStatus(userStep?.status),
          paused: userStep?.paused ?? false,
          remainingSec: userStep?.remainingSec ?? null,
          createdAt: userStep?.createdAt ?? null,
          updatedAt: userStep?.updatedAt ?? null,
        };
      });
      const completedSteps = orderedSteps.filter(
        (step) => step.status === TrainingStatus.COMPLETED,
      ).length;
      const lastStepActivityAt = orderedSteps
        .map((step) => step.updatedAt)
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const firstIncompleteStepIndex = orderedSteps.findIndex(
        (step) => step.status !== TrainingStatus.COMPLETED,
      );
      const currentStepIndex =
        training.currentStepIndex != null && training.currentStepIndex >= 0
          ? training.currentStepIndex
          : firstIncompleteStepIndex;

      return {
        userId: training.userId,
        username: training.user.username,
        openedAt: training.createdAt,
        status: mapStepStatus(training.status),
        completedSteps,
        totalSteps,
        lastActivityAt: lastStepActivityAt ?? training.updatedAt,
        currentStepTitle: orderedSteps[currentStepIndex < 0 ? 0 : currentStepIndex]?.title ?? null,
        steps: orderedSteps,
      };
    })
    .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());

  const startedUsers = users.filter((user) =>
    user.steps.some((step) => step.status !== TrainingStatus.NOT_STARTED),
  ).length;

  return {
    scheduleId: schedule.id,
    mskDate: toDateKey(schedule.date),
    bundleId: schedule.bundle.id,
    title: schedule.bundle.title,
    totalSteps,
    summary: {
      openedUsers: users.length,
      startedUsers,
      completedUsers: users.filter((user) => user.status === TrainingStatus.COMPLETED).length,
      openedWithoutStartUsers: users.length - startedUsers,
    },
    users,
  };
}

export async function getDailyCourseScheduleRange(
  actor: DailyCourseActor,
  input: DailyCourseRangeInput,
): Promise<DailyCourseScheduleDto[]> {
  assertCanManageDailyCourse(actor);
  const parsed = dailyCourseRangeSchema.parse(input);
  const rows = await prisma.dailyCourseSchedule.findMany({
    where: {
      date: {
        gte: dateKeyToDate(parsed.from),
        lte: dateKeyToDate(parsed.to),
      },
      ...(isElevated(actor) ? {} : { bundle: { authorId: actor.id } }),
    },
    orderBy: { date: "asc" },
    select: {
      id: true,
      date: true,
      isPublished: true,
      bundle: {
        select: {
          id: true,
          title: true,
          type: true,
          stepLinks: { select: { id: true } },
        },
      },
      createdBy: { select: { id: true, username: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    date: toDateKey(row.date),
    isPublished: row.isPublished,
    bundle: {
      id: row.bundle.id,
      title: row.bundle.title,
      type: row.bundle.type,
      stepsCount: row.bundle.stepLinks.length,
    },
    createdBy: row.createdBy,
  }));
}

export async function getDailyCourseCandidates(
  actor: DailyCourseActor,
): Promise<DailyCourseCandidateDto[]> {
  assertCanManageDailyCourse(actor);
  const bundles = await prisma.dailyCourseBundle.findMany({
    where: isElevated(actor) ? {} : { authorId: actor.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      type: true,
      authorId: true,
      author: { select: { username: true } },
      stepLinks: {
        orderBy: { order: "asc" },
        select: dailyCourseBundleStepSelect,
      },
    },
  });

  return bundles
    .filter((bundle) => {
      try {
        validateDailyCourseStepLinks(bundle.stepLinks);
        return true;
      } catch {
        return false;
      }
    })
    .map((bundle) => ({
      id: bundle.id,
      title: bundle.title,
      type: bundle.type,
      stepsCount: bundle.stepLinks.length,
      authorId: bundle.authorId,
      authorUsername: bundle.author.username,
    }));
}

export async function getDailyCourseBundles(
  actor: DailyCourseActor,
): Promise<DailyCourseBundleDto[]> {
  assertCanManageDailyCourse(actor);
  const bundles = await prisma.dailyCourseBundle.findMany({
    where: isElevated(actor) ? {} : { authorId: actor.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      equipment: true,
      description: true,
      type: true,
      authorId: true,
      author: { select: { username: true } },
      stepLinks: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          step: { select: { id: true, title: true, type: true } },
        },
      },
    },
  });

  return bundles.map((bundle) => ({
    id: bundle.id,
    title: bundle.title,
    equipment: bundle.equipment,
    description: bundle.description,
    type: bundle.type,
    stepsCount: bundle.stepLinks.length,
    authorId: bundle.authorId,
    authorUsername: bundle.author.username,
    steps: bundle.stepLinks.map((link) => ({
      id: link.step.id,
      title: link.step.title,
      type: link.step.type,
      order: link.order,
    })),
  }));
}

export async function getDailyCourseBundleStepCandidates(
  actor: DailyCourseActor,
): Promise<DailyCourseStepCandidateDto[]> {
  assertCanManageDailyCourse(actor);
  const steps = await prisma.step.findMany({
    where: {
      ...(isElevated(actor) ? {} : { authorId: actor.id }),
      isDailyCourse: true,
      OR: [
        {
          type: { in: NON_EXAMINATION_STEP_TYPES },
          requiresVideoReport: false,
          requiresWrittenFeedback: false,
          hasTestQuestions: false,
        },
        { type: "EXAMINATION" },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      type: true,
      durationSec: true,
      authorId: true,
      author: { select: { username: true } },
    },
  });

  return steps.map((step) => ({
    id: step.id,
    title: step.title,
    type: step.type,
    durationSec: step.durationSec,
    authorId: step.authorId,
    authorUsername: step.author.username,
  }));
}

export async function upsertDailyCourseBundle(
  actor: DailyCourseActor,
  input: UpsertDailyCourseBundleInput,
): Promise<{ success: true; id: string }> {
  assertCanManageDailyCourse(actor);
  const parsed = upsertDailyCourseBundleSchema.parse(input);

  const uniqueStepIds = Array.from(new Set(parsed.stepIds));
  if (uniqueStepIds.length !== parsed.stepIds.length) {
    throw new Error("DAILY_COURSE_DUPLICATE_STEPS");
  }

  const steps = await prisma.step.findMany({
    where: { id: { in: parsed.stepIds } },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      durationSec: true,
      estimatedDurationSec: true,
      videoUrl: true,
      imageUrls: true,
      pdfUrls: true,
      checklist: true,
      requiresVideoReport: true,
      requiresWrittenFeedback: true,
      hasTestQuestions: true,
      surveySlug: true,
      isDailyCourse: true,
      authorId: true,
    },
  });

  const byId = new Map(steps.map((step) => [step.id, step]));
  const orderedStepLinks = parsed.stepIds.map((stepId, index) => {
    const step = byId.get(stepId);
    if (!step) throw new Error("STEP_NOT_FOUND");
    if (!isElevated(actor) && step.authorId !== actor.id) throw new Error("FORBIDDEN");
    if (!step.isDailyCourse) throw new Error("DAILY_COURSE_INVALID_STEP_SCOPE");
    return { id: `new-${index}`, order: index + 1, step };
  });
  validateDailyCourseStepLinks(orderedStepLinks);

  if (parsed.id) {
    const existing = await prisma.dailyCourseBundle.findUnique({
      where: { id: parsed.id },
      select: {
        authorId: true,
        schedules: { select: { id: true }, take: 1 },
      },
    });
    if (!existing) throw new Error("DAILY_COURSE_BUNDLE_NOT_FOUND");
    if (!isElevated(actor) && existing.authorId !== actor.id) throw new Error("FORBIDDEN");
    if (existing.schedules.length > 0) throw new Error("DAILY_COURSE_BUNDLE_IN_USE");
  }

  const row = await prisma.$transaction(async (tx) => {
    const bundle = parsed.id
      ? await tx.dailyCourseBundle.update({
          where: { id: parsed.id },
          data: {
            title: parsed.title,
            equipment: parsed.equipment,
            description: parsed.description,
            type: parsed.type,
          },
          select: { id: true },
        })
      : await tx.dailyCourseBundle.create({
          data: {
            title: parsed.title,
            equipment: parsed.equipment,
            description: parsed.description,
            type: parsed.type,
            authorId: actor.id,
          },
          select: { id: true },
        });

    await tx.dailyCourseBundleStep.deleteMany({ where: { bundleId: bundle.id } });
    await tx.dailyCourseBundleStep.createMany({
      data: parsed.stepIds.map((stepId, index) => ({
        bundleId: bundle.id,
        stepId,
        order: index + 1,
      })),
    });
    return bundle;
  });

  return { success: true, id: row.id };
}

export async function deleteDailyCourseBundle(
  actor: DailyCourseActor,
  input: { bundleId: string },
): Promise<{ success: true }> {
  assertCanManageDailyCourse(actor);
  const parsed = deleteDailyCourseBundleSchema.parse(input);
  const bundle = await prisma.dailyCourseBundle.findUnique({
    where: { id: parsed.bundleId },
    select: {
      id: true,
      authorId: true,
      schedules: { select: { id: true }, take: 1 },
    },
  });
  if (!bundle) throw new Error("DAILY_COURSE_BUNDLE_NOT_FOUND");
  if (!isElevated(actor) && bundle.authorId !== actor.id) throw new Error("FORBIDDEN");
  if (bundle.schedules.length > 0) throw new Error("DAILY_COURSE_BUNDLE_IN_USE");
  await prisma.dailyCourseBundle.delete({ where: { id: bundle.id } });
  return { success: true };
}

export async function upsertDailyCourseSchedule(
  actor: DailyCourseActor,
  input: UpsertDailyCourseScheduleInput,
): Promise<{ success: true; id: string }> {
  assertCanManageDailyCourse(actor);
  const parsed = upsertDailyCourseScheduleSchema.parse(input);
  const today = getMoscowDateKey();
  if (parsed.date < today) {
    throw new Error("DAILY_COURSE_PAST_DATE");
  }

  await getValidatedDailyCourseBundle(parsed.bundleId, actor);

  const existing = await prisma.dailyCourseSchedule.findUnique({
    where: { date: dateKeyToDate(parsed.date) },
    select: { id: true, isPublished: true },
  });
  if (existing && parsed.date <= today && existing.isPublished) {
    throw new Error("DAILY_COURSE_TODAY_ALREADY_PUBLISHED");
  }

  const row = await prisma.dailyCourseSchedule.upsert({
    where: { date: dateKeyToDate(parsed.date) },
    create: {
      date: dateKeyToDate(parsed.date),
      bundleId: parsed.bundleId,
      createdById: actor.id,
      isPublished: parsed.isPublished,
    },
    update: {
      bundleId: parsed.bundleId,
      isPublished: parsed.isPublished,
    },
    select: { id: true },
  });

  logger.info("Daily course schedule upserted", {
    scheduleId: row.id,
    date: parsed.date,
    actorId: actor.id,
  });

  return { success: true, id: row.id };
}

export async function deleteDailyCourseSchedule(
  actor: DailyCourseActor,
  input: { scheduleId: string },
): Promise<{ success: true }> {
  assertCanManageDailyCourse(actor);
  const parsed = deleteDailyCourseScheduleSchema.parse(input);
  const schedule = await prisma.dailyCourseSchedule.findUnique({
    where: { id: parsed.scheduleId },
    select: {
      id: true,
      date: true,
      bundle: { select: { authorId: true } },
    },
  });
  if (!schedule) {
    throw new Error("SCHEDULE_NOT_FOUND");
  }
  if (!isElevated(actor) && schedule.bundle.authorId !== actor.id) {
    throw new Error("FORBIDDEN");
  }
  if (toDateKey(schedule.date) <= getMoscowDateKey()) {
    throw new Error("DAILY_COURSE_DELETE_ONLY_FUTURE");
  }
  await prisma.dailyCourseSchedule.delete({ where: { id: schedule.id } });
  return { success: true };
}

export async function previewDailyCourseCleanup(
  actor: DailyCourseActor,
  input: { mode: DailyCourseCleanupMode; today?: string },
): Promise<DailyCourseCleanupPreviewDto> {
  assertCanManageDailyCourse(actor);
  const plan = await buildDailyCourseCleanupPlan(actor, input);
  return plan.preview;
}

export async function cleanupDailyCourseContent(
  actor: DailyCourseActor,
  input: { mode: DailyCourseCleanupMode; confirmation: string; today?: string },
): Promise<DailyCourseCleanupResultDto> {
  assertCanManageDailyCourse(actor);
  if (input.confirmation !== DAILY_COURSE_CLEANUP_CONFIRMATION) {
    throw new Error("DAILY_COURSE_CLEANUP_CONFIRMATION_REQUIRED");
  }

  const plan = await buildDailyCourseCleanupPlan(actor, input);
  const deleted = await prisma.$transaction(async (tx: Tx) => {
    const schedules =
      plan.scheduleIds.length > 0
        ? await tx.dailyCourseSchedule.deleteMany({
            where: scopedScheduleIdWhere(actor, plan.scheduleIds),
          })
        : { count: 0 };
    const bundles =
      plan.bundleIds.length > 0
        ? await tx.dailyCourseBundle.deleteMany({
            where: scopedBundleIdWhere(actor, plan.bundleIds),
          })
        : { count: 0 };
    const steps =
      plan.stepIds.length > 0
        ? await tx.step.deleteMany({
            where: scopedSafeDailyCourseStepIdWhere(actor, plan.stepIds),
          })
        : { count: 0 };

    return {
      schedules: schedules.count,
      bundles: bundles.count,
      steps: steps.count,
    };
  });

  // Cleanup is a real Step deletion (unlike progress updates). Any cached
  // regular course referring to a deleted shared step must be invalidated.
  if (deleted.steps > 0) {
    invalidateStepsContentCache(plan.stepIds);
    await publishCourseContentChange();
  }
  return { preview: plan.preview, deleted };
}

interface DailyCourseCleanupPlan {
  preview: DailyCourseCleanupPreviewDto;
  scheduleIds: string[];
  bundleIds: string[];
  stepIds: string[];
}

async function buildDailyCourseCleanupPlan(
  actor: DailyCourseActor,
  input: { mode: DailyCourseCleanupMode; today?: string },
): Promise<DailyCourseCleanupPlan> {
  const today = input.today ?? getMoscowDateKey();
  const schedules = await prisma.dailyCourseSchedule.findMany({
    where: cleanupScheduleWhere(actor, input.mode, today),
    select: {
      id: true,
      date: true,
      userTrainings: {
        select: {
          id: true,
          steps: { select: { id: true } },
        },
      },
    },
  });
  const scheduleIds = schedules.map((schedule) => schedule.id);
  const scheduleIdSet = new Set(scheduleIds);

  const bundles = await prisma.dailyCourseBundle.findMany({
    where: cleanupBundleWhere(actor, input.mode, scheduleIds),
    select: {
      id: true,
      schedules: { select: { id: true } },
      stepLinks: { select: { stepId: true } },
    },
  });
  const deletableBundles =
    input.mode === "all"
      ? bundles
      : bundles.filter((bundle) =>
          bundle.schedules.every((schedule) => scheduleIdSet.has(schedule.id)),
        );
  const bundleIds = deletableBundles.map((bundle) => bundle.id);
  const bundleIdSet = new Set(bundleIds);
  const linkedStepIds = Array.from(
    new Set(deletableBundles.flatMap((bundle) => bundle.stepLinks.map((link) => link.stepId))),
  );

  const steps = await prisma.step.findMany({
    where:
      input.mode === "all"
        ? cleanupAllDailyCourseStepWhere(actor)
        : cleanupLinkedDailyCourseStepWhere(actor, linkedStepIds),
    select: {
      id: true,
      title: true,
      stepLinks: { select: { id: true } },
      dailyCourseBundleLinks: { select: { bundleId: true } },
    },
  });

  const skippedSteps: DailyCourseCleanupSkippedStepDto[] = [];
  const stepIds: string[] = [];
  for (const step of steps) {
    if (step.stepLinks.length > 0) {
      skippedSteps.push({
        id: step.id,
        title: step.title,
        reason: "REGULAR_COURSE_LINK",
      });
      continue;
    }
    if (
      input.mode === "future" &&
      step.dailyCourseBundleLinks.some((link) => !bundleIdSet.has(link.bundleId))
    ) {
      skippedSteps.push({
        id: step.id,
        title: step.title,
        reason: "SHARED_DAILY_BUNDLE_LINK",
      });
      continue;
    }
    stepIds.push(step.id);
  }

  const userTrainingsToDelete = schedules.reduce(
    (sum, schedule) => sum + schedule.userTrainings.length,
    0,
  );
  const userStepsToDelete = schedules.reduce(
    (sum, schedule) =>
      sum +
      schedule.userTrainings.reduce((stepsSum, training) => stepsSum + training.steps.length, 0),
    0,
  );

  return {
    preview: {
      mode: input.mode,
      schedulesToDelete: scheduleIds.length,
      bundlesToDelete: bundleIds.length,
      stepsToDelete: stepIds.length,
      skippedSteps,
      userTrainingsToDelete,
      userStepsToDelete,
    },
    scheduleIds,
    bundleIds,
    stepIds,
  };
}

function cleanupScheduleWhere(
  actor: DailyCourseActor,
  mode: DailyCourseCleanupMode,
  today: string,
): Prisma.DailyCourseScheduleWhereInput {
  return {
    ...(mode === "future" ? { date: { gt: dateKeyToDate(today) } } : {}),
    ...(isElevated(actor) ? {} : { bundle: { authorId: actor.id } }),
  };
}

function cleanupBundleWhere(
  actor: DailyCourseActor,
  mode: DailyCourseCleanupMode,
  scheduleIds: string[],
): Prisma.DailyCourseBundleWhereInput {
  return {
    ...(isElevated(actor) ? {} : { authorId: actor.id }),
    ...(mode === "future" ? { schedules: { some: { id: { in: scheduleIds } } } } : {}),
  };
}

function cleanupAllDailyCourseStepWhere(actor: DailyCourseActor): Prisma.StepWhereInput {
  return {
    isDailyCourse: true,
    ...(isElevated(actor) ? {} : { authorId: actor.id }),
  };
}

function cleanupLinkedDailyCourseStepWhere(
  actor: DailyCourseActor,
  linkedStepIds: string[],
): Prisma.StepWhereInput {
  return {
    id: { in: linkedStepIds },
    isDailyCourse: true,
    ...(isElevated(actor) ? {} : { authorId: actor.id }),
  };
}

function scopedScheduleIdWhere(
  actor: DailyCourseActor,
  scheduleIds: string[],
): Prisma.DailyCourseScheduleWhereInput {
  return {
    id: { in: scheduleIds },
    ...(isElevated(actor) ? {} : { bundle: { authorId: actor.id } }),
  };
}

function scopedBundleIdWhere(
  actor: DailyCourseActor,
  bundleIds: string[],
): Prisma.DailyCourseBundleWhereInput {
  return {
    id: { in: bundleIds },
    ...(isElevated(actor) ? {} : { authorId: actor.id }),
  };
}

function scopedSafeDailyCourseStepIdWhere(
  actor: DailyCourseActor,
  stepIds: string[],
): Prisma.StepWhereInput {
  return {
    id: { in: stepIds },
    isDailyCourse: true,
    ...(isElevated(actor) ? {} : { authorId: actor.id }),
    stepLinks: { none: {} },
  };
}

export async function previewDailyCourseImportFile(
  actor: DailyCourseActor,
  input: { content: string; today?: string },
): Promise<DailyCourseImportPreviewDto> {
  assertCanManageDailyCourse(actor);
  const parsed = parseDailyCourseImportFile(input.content);
  const today = input.today ?? getMoscowDateKey();
  const nonEmptyDates = parsed.days.filter((day) => !day.isEmpty).map((day) => day.date);
  const schedules =
    nonEmptyDates.length > 0
      ? await prisma.dailyCourseSchedule.findMany({
          where: { date: { in: nonEmptyDates.map(dateKeyToDate) } },
          select: {
            id: true,
            date: true,
            isPublished: true,
            bundle: { select: { title: true } },
          },
        })
      : [];
  const conflictByDate = new Map(
    schedules.map((schedule) => [
      toDateKey(schedule.date),
      {
        scheduleId: schedule.id,
        bundleTitle: schedule.bundle.title,
        isPublished: schedule.isPublished,
      },
    ]),
  );

  const days = parsed.days.map((day): DailyCourseImportPreviewDayDto => {
    const conflict = conflictByDate.get(day.date) ?? null;
    const hasErrors = day.errors.length > 0 || day.steps.some((step) => step.errors.length > 0);
    const isPast = day.date < today;
    const canReplaceConflict = Boolean(conflict && day.date > today && !hasErrors);
    return {
      ...day,
      isPast,
      conflict,
      canReplaceConflict,
      canImport: !day.isEmpty && !hasErrors && !isPast && !conflict,
    };
  });

  return buildImportPreview(days, parsed);
}

export async function importDailyCourseFile(
  actor: DailyCourseActor,
  input: { content: string; replaceConflicts: boolean; today?: string },
): Promise<DailyCourseImportResultDto> {
  assertCanManageDailyCourse(actor);
  const today = input.today ?? getMoscowDateKey();
  const preview = await previewDailyCourseImportFile(actor, { content: input.content, today });
  const importedDates: string[] = [];
  const skippedDates: { date: string; reason: string }[] = [];

  for (const day of preview.days) {
    if (day.isEmpty) continue;
    const hasErrors = day.errors.length > 0 || day.steps.some((step) => step.errors.length > 0);
    if (hasErrors) {
      skippedDates.push({ date: day.date, reason: "ERRORS" });
      continue;
    }
    if (day.isPast) {
      skippedDates.push({ date: day.date, reason: "PAST_DATE" });
      continue;
    }
    if (day.conflict && (!input.replaceConflicts || day.date <= today)) {
      skippedDates.push({ date: day.date, reason: "CONFLICT" });
      continue;
    }

    await createDailyCourseImportDay(actor, day);
    importedDates.push(day.date);
  }

  return { preview, importedDates, skippedDates };
}

function buildImportPreview(
  days: DailyCourseImportPreviewDayDto[],
  parsed: ParsedDailyCourseImportFile,
): DailyCourseImportPreviewDto {
  const errorDays = days.filter(
    (day) => day.errors.length > 0 || day.steps.some((step) => step.errors.length > 0),
  ).length;
  return {
    days,
    hasErrors: parsed.hasErrors || errorDays > 0,
    summary: {
      totalDays: days.length,
      emptyDays: days.filter((day) => day.isEmpty).length,
      importableDays: days.filter((day) => day.canImport).length,
      conflictDays: days.filter((day) => day.conflict).length,
      errorDays,
    },
  };
}

async function createDailyCourseImportDay(
  actor: DailyCourseActor,
  day: DailyCourseImportPreviewDayDto,
): Promise<void> {
  await prisma.$transaction(async (tx: Tx) => {
    const createdSteps = [];
    for (const step of day.steps) {
      const created = await tx.step.create({
        data: {
          id: randomUUID(),
          title: step.title,
          description: step.description,
          durationSec: step.type === "TRAINING" ? step.durationSec : null,
          estimatedDurationSec: step.type === "TRAINING" ? null : step.estimatedDurationSec,
          type: step.type as PrismaStepType,
          videoUrl: null,
          imageUrls: [],
          pdfUrls: [],
          checklist: step.hasTestQuestions
            ? (step.questions as unknown as Prisma.InputJsonValue)
            : undefined,
          requiresVideoReport:
            step.type === "EXAMINATION" ? Boolean(step.requiresVideoReport) : false,
          requiresWrittenFeedback:
            step.type === "EXAMINATION" ? Boolean(step.requiresWrittenFeedback) : false,
          hasTestQuestions: step.type === "EXAMINATION" ? Boolean(step.hasTestQuestions) : false,
          surveySlug: step.type === "SURVEY" ? step.surveySlug : null,
          isDailyCourse: true,
          authorId: actor.id,
        },
        select: { id: true },
      });
      createdSteps.push(created);
    }

    const bundle = await tx.dailyCourseBundle.create({
      data: {
        title: day.bundleTitle,
        equipment: day.equipment,
        description: day.description,
        type: day.type,
        authorId: actor.id,
      },
      select: { id: true },
    });

    await tx.dailyCourseBundleStep.createMany({
      data: createdSteps.map((step, index) => ({
        bundleId: bundle.id,
        stepId: step.id,
        order: index + 1,
      })),
    });

    await tx.dailyCourseSchedule.upsert({
      where: { date: dateKeyToDate(day.date) },
      create: {
        date: dateKeyToDate(day.date),
        bundleId: bundle.id,
        createdById: actor.id,
        isPublished: true,
      },
      update: {
        bundleId: bundle.id,
        isPublished: true,
      },
      select: { id: true },
    });
  });
}
