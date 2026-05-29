"use server";

import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { z } from "zod";

import {
  getDailyCourseDayWithUserSteps,
  getTodayDailyCourse,
  updateDailyCourseStepAndDay,
  type DailyCourseDayResponse,
  type TodayDailyCourseResponse,
} from "@gafus/core/services/dailyCourse";
import type { TrainingDetail } from "@gafus/types";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { stepIndexSchema } from "@shared/lib/validation/schemas";

const scheduleIdSchema = z.string().cuid("scheduleId должен быть CUID");
const timeLeftSchema = z.number().min(0, "Оставшееся время должно быть неотрицательным");

function getDailyCourseStoreCourseId(scheduleId: string): string {
  return `daily-course:${scheduleId}`;
}

function mapDailyCourseDayToTraining(day: DailyCourseDayResponse): TrainingDetail {
  return {
    trainingDayId: day.trainingDayId,
    dayOnCourseId: day.scheduleId,
    displayDayNumber: null,
    title: day.title,
    type: day.type,
    showCoursePathExport: false,
    courseId: getDailyCourseStoreCourseId(day.scheduleId),
    description: day.description,
    duration: "",
    userStatus: day.userStatus,
    steps: day.steps.map((dailyStep) => ({
      id: dailyStep.step.id,
      videoUrl: dailyStep.step.videoUrl,
      pdfUrls: dailyStep.step.pdfUrls,
      imageUrls: dailyStep.step.imageUrls,
      title: dailyStep.step.title,
      description: dailyStep.step.description,
      durationSec: dailyStep.step.durationSec ?? 0,
      estimatedDurationSec: dailyStep.step.estimatedDurationSec,
      status: dailyStep.status,
      order: dailyStep.step.order,
      isPausedOnServer: dailyStep.isPausedOnServer,
      remainingSecOnServer: dailyStep.remainingSecOnServer,
      type: dailyStep.step.type as TrainingDetail["steps"][number]["type"],
      checklist: dailyStep.step.checklist,
      requiresVideoReport: dailyStep.step.requiresVideoReport,
      requiresWrittenFeedback: dailyStep.step.requiresWrittenFeedback,
      hasTestQuestions: dailyStep.step.hasTestQuestions,
      surveySlug: dailyStep.step.surveySlug,
      userStepId: dailyStep.id,
    })),
  };
}

export async function getTodayDailyCourseForWeb(): Promise<TodayDailyCourseResponse | null> {
  noStore();
  const userId = await getCurrentUserId().catch(() => null);
  if (!userId) return null;
  return getTodayDailyCourse(userId);
}

export async function getDailyCourseTrainingForWeb(
  scheduleId: string,
): Promise<TrainingDetail | null> {
  noStore();
  const safeScheduleId = scheduleIdSchema.parse(scheduleId);
  const userId = await getCurrentUserId();
  const day = await getDailyCourseDayWithUserSteps(userId, safeScheduleId, {
    createIfMissing: true,
  });
  return day ? mapDailyCourseDayToTraining(day) : null;
}

export async function startDailyCourseStepServerAction(
  scheduleId: string,
  stepIndex: number,
  durationSec: number,
): Promise<{ success: boolean }> {
  const safeScheduleId = scheduleIdSchema.parse(scheduleId);
  const safeStepIndex = stepIndexSchema.parse(stepIndex);
  const userId = await getCurrentUserId();
  await updateDailyCourseStepAndDay(userId, safeScheduleId, safeStepIndex, {
    type: "start",
    remainingSec: Math.max(Math.floor(Number(durationSec) || 0), 0),
  });
  revalidatePath(`/daily-course/${safeScheduleId}`);
  return { success: true };
}

export async function pauseDailyCourseStepServerAction(
  scheduleId: string,
  stepIndex: number,
  timeLeftSec: number,
): Promise<{ success: boolean }> {
  const safeScheduleId = scheduleIdSchema.parse(scheduleId);
  const safeStepIndex = stepIndexSchema.parse(stepIndex);
  const safeTimeLeftSec = timeLeftSchema.parse(timeLeftSec);
  const userId = await getCurrentUserId();
  await updateDailyCourseStepAndDay(userId, safeScheduleId, safeStepIndex, {
    type: "pause",
    remainingSec: Math.max(Math.floor(Number(safeTimeLeftSec) || 0), 0),
  });
  revalidatePath(`/daily-course/${safeScheduleId}`);
  return { success: true };
}

export async function resumeDailyCourseStepServerAction(
  scheduleId: string,
  stepIndex: number,
): Promise<{ success: boolean }> {
  const safeScheduleId = scheduleIdSchema.parse(scheduleId);
  const safeStepIndex = stepIndexSchema.parse(stepIndex);
  const userId = await getCurrentUserId();
  await updateDailyCourseStepAndDay(userId, safeScheduleId, safeStepIndex, { type: "resume" });
  revalidatePath(`/daily-course/${safeScheduleId}`);
  return { success: true };
}

export async function resetDailyCourseStepServerAction(
  scheduleId: string,
  stepIndex: number,
): Promise<{ success: boolean }> {
  const safeScheduleId = scheduleIdSchema.parse(scheduleId);
  const safeStepIndex = stepIndexSchema.parse(stepIndex);
  const userId = await getCurrentUserId();
  await updateDailyCourseStepAndDay(userId, safeScheduleId, safeStepIndex, { type: "reset" });
  revalidatePath(`/daily-course/${safeScheduleId}`);
  return { success: true };
}

export async function completeDailyCourseStepServerAction(
  scheduleId: string,
  stepIndex: number,
): Promise<{ success: boolean }> {
  const safeScheduleId = scheduleIdSchema.parse(scheduleId);
  const safeStepIndex = stepIndexSchema.parse(stepIndex);
  const userId = await getCurrentUserId();
  await updateDailyCourseStepAndDay(userId, safeScheduleId, safeStepIndex, { type: "complete" });
  revalidatePath(`/daily-course/${safeScheduleId}`);
  return { success: true };
}
