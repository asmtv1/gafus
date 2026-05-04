"use server";

import { authOptions } from "@gafus/auth";
import {
  deleteDailyCourseSchedule,
  getDailyCourseCandidates,
  getDailyCourseBundles,
  getDailyCourseBundleStepCandidates,
  getDailyCourseScheduleRange,
  upsertDailyCourseBundle,
  upsertDailyCourseSchedule,
  deleteDailyCourseBundle,
  dailyCourseRangeSchema,
  upsertDailyCourseBundleSchema,
  upsertDailyCourseScheduleSchema,
} from "@gafus/core/services/dailyCourse";
import type {
  DailyCourseBundleDto,
  DailyCourseCandidateDto,
  DailyCourseScheduleDto,
  DailyCourseStepCandidateDto,
} from "@gafus/core/services/dailyCourse";
import { createTrainerPanelLogger } from "@gafus/logger";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

const logger = createTrainerPanelLogger("trainer-panel-daily-course");

type SessionUser = { id: string; role: string };

async function getDailyCourseActor(): Promise<SessionUser> {
  const session = (await getServerSession(authOptions)) as {
    user?: SessionUser;
  } | null;
  if (!session?.user?.id) {
    throw new Error("Не авторизован");
  }
  if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
    throw new Error("Нет доступа");
  }
  return session.user;
}

export async function getDailyCoursePageData(input: {
  from: string;
  to: string;
}): Promise<{
  schedule: DailyCourseScheduleDto[];
  candidates: DailyCourseCandidateDto[];
}> {
  const actor = await getDailyCourseActor();
  const parsed = dailyCourseRangeSchema.parse(input);
  const [schedule, candidates] = await Promise.all([
    getDailyCourseScheduleRange(actor, parsed),
    getDailyCourseCandidates(actor),
  ]);
  return { schedule, candidates };
}

export async function getDailyCourseBundlesPageData(): Promise<{
  bundles: DailyCourseBundleDto[];
  steps: DailyCourseStepCandidateDto[];
}> {
  const actor = await getDailyCourseActor();
  const [bundles, steps] = await Promise.all([
    getDailyCourseBundles(actor),
    getDailyCourseBundleStepCandidates(actor),
  ]);
  return { bundles, steps };
}

export async function upsertDailyCourseScheduleAction(
  _prevState: { success?: boolean; error?: string },
  formData: FormData,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const actor = await getDailyCourseActor();
    const parsed = upsertDailyCourseScheduleSchema.parse({
      date: formData.get("date")?.toString() ?? "",
      bundleId: formData.get("bundleId")?.toString() ?? "",
      isPublished: formData.get("isPublished")?.toString() !== "false",
    });
    await upsertDailyCourseSchedule(actor, parsed);
    revalidatePath("/main-panel/daily-course");
    return { success: true };
  } catch (error) {
    logger.error("Ошибка сохранения курса дня", error as Error);
    return {
      success: false,
      error: error instanceof Error ? mapDailyCourseError(error.message) : "Неизвестная ошибка",
    };
  }
}

export async function upsertDailyCourseBundleAction(
  _prevState: { success?: boolean; error?: string },
  formData: FormData,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const actor = await getDailyCourseActor();
    const stepIds = formData
      .getAll("stepIds")
      .map((value) => value.toString())
      .filter(Boolean);
    const parsed = upsertDailyCourseBundleSchema.parse({
      id: formData.get("id")?.toString() || undefined,
      title: formData.get("title")?.toString() ?? "",
      equipment: formData.get("equipment")?.toString() ?? "",
      description: formData.get("description")?.toString() ?? "",
      type: formData.get("type")?.toString() || "daily_course",
      stepIds,
    });
    await upsertDailyCourseBundle(actor, parsed);
    revalidatePath("/main-panel/daily-course");
    revalidatePath("/main-panel/daily-course/bundles");
    return { success: true };
  } catch (error) {
    logger.error("Ошибка сохранения связки курса дня", error as Error);
    return {
      success: false,
      error: error instanceof Error ? mapDailyCourseError(error.message) : "Неизвестная ошибка",
    };
  }
}

export async function deleteDailyCourseBundleAction(
  bundleId: string,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const actor = await getDailyCourseActor();
    await deleteDailyCourseBundle(actor, { bundleId });
    revalidatePath("/main-panel/daily-course");
    revalidatePath("/main-panel/daily-course/bundles");
    return { success: true };
  } catch (error) {
    logger.error("Ошибка удаления связки курса дня", error as Error, { bundleId });
    return {
      success: false,
      error: error instanceof Error ? mapDailyCourseError(error.message) : "Неизвестная ошибка",
    };
  }
}

export async function deleteDailyCourseScheduleAction(
  scheduleId: string,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const actor = await getDailyCourseActor();
    await deleteDailyCourseSchedule(actor, { scheduleId });
    revalidatePath("/main-panel/daily-course");
    return { success: true };
  } catch (error) {
    logger.error("Ошибка удаления курса дня", error as Error, { scheduleId });
    return {
      success: false,
      error: error instanceof Error ? mapDailyCourseError(error.message) : "Неизвестная ошибка",
    };
  }
}

function mapDailyCourseError(code: string): string {
  switch (code) {
    case "FORBIDDEN":
      return "Нет доступа";
    case "DAILY_COURSE_INVALID_STEPS_COUNT":
      return "В связке должно быть от 2 до 5 упражнений";
    case "DAILY_COURSE_DUPLICATE_STEPS":
      return "В связке не должно быть повторяющихся шагов";
    case "DAILY_COURSE_INVALID_STEP_TYPE":
      return "В курсе дня можно использовать только тренировку, упражнение, теорию и перерыв";
    case "DAILY_COURSE_INVALID_REPORT_STEP":
      return "Курс дня не поддерживает экзамены, тесты, видеоотчёты и письменную проверку";
    case "DAILY_COURSE_INVALID_STEP_SCOPE":
      return "В связке курса дня можно использовать только шаги с отметкой «для курса дня»";
    case "DAILY_COURSE_PAST_DATE":
      return "Нельзя планировать курс дня на прошедшую дату";
    case "DAILY_COURSE_TODAY_ALREADY_PUBLISHED":
      return "Опубликованный курс дня на сегодня уже нельзя менять";
    case "DAILY_COURSE_DELETE_ONLY_FUTURE":
      return "Удалять можно только будущие даты";
    case "DAILY_COURSE_BUNDLE_NOT_FOUND":
      return "Связка не найдена";
    case "DAILY_COURSE_BUNDLE_IN_USE":
      return "Связка уже используется в расписании, удалить её нельзя";
    case "STEP_NOT_FOUND":
      return "Один из шагов не найден";
    default:
      return code;
  }
}
