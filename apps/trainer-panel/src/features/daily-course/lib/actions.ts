"use server";

import { authOptions } from "@gafus/auth";
import {
  cleanupDailyCourseContent,
  deleteDailyCourseSchedule,
  getDailyCourseCandidates,
  getDailyCourseBundles,
  getDailyCourseBundleStepCandidates,
  getDailyCourseScheduleRange,
  getDailyCourseScheduleStatistics,
  importDailyCourseFile,
  previewDailyCourseCleanup,
  previewDailyCourseImportFile,
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
  DailyCourseCleanupMode,
  DailyCourseCleanupPreviewDto,
  DailyCourseCleanupResultDto,
  DailyCourseImportPreviewDto,
  DailyCourseImportResultDto,
  DailyCourseScheduleDto,
  DailyCourseScheduleStatisticsDto,
  DailyCourseStepCandidateDto,
} from "@gafus/core/services/dailyCourse";
import { createTrainerPanelLogger } from "@gafus/logger";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

const logger = createTrainerPanelLogger("trainer-panel-daily-course");

type SessionUser = { id: string; role: string };
const MAX_IMPORT_FILE_SIZE_BYTES = 1024 * 1024;

export interface DailyCourseImportPreviewState {
  success?: boolean;
  error?: string;
  content?: string;
  preview?: DailyCourseImportPreviewDto;
}

export interface DailyCourseImportConfirmState {
  success?: boolean;
  error?: string;
  result?: DailyCourseImportResultDto;
}

export interface DailyCourseCleanupPreviewState {
  success?: boolean;
  error?: string;
  preview?: DailyCourseCleanupPreviewDto;
}

export interface DailyCourseCleanupConfirmState {
  success?: boolean;
  error?: string;
  result?: DailyCourseCleanupResultDto;
}

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

export async function getDailyCoursePageData(input: { from: string; to: string }): Promise<{
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

export async function getDailyCourseStatisticsPageData(input: {
  from: string;
  to: string;
  scheduleId?: string;
}): Promise<{
  schedule: DailyCourseScheduleDto[];
  selectedScheduleId: string | null;
  statistics: DailyCourseScheduleStatisticsDto | null;
}> {
  const actor = await getDailyCourseActor();
  const parsed = dailyCourseRangeSchema.parse({ from: input.from, to: input.to });
  const schedule = await getDailyCourseScheduleRange(actor, parsed);
  const selectedScheduleId =
    input.scheduleId && schedule.some((item) => item.id === input.scheduleId)
      ? input.scheduleId
      : (schedule[0]?.id ?? null);
  const statistics = selectedScheduleId
    ? await getDailyCourseScheduleStatistics(actor, { scheduleId: selectedScheduleId })
    : null;

  return {
    schedule,
    selectedScheduleId,
    statistics,
  };
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

export async function previewDailyCourseImportAction(
  _prevState: DailyCourseImportPreviewState,
  formData: FormData,
): Promise<DailyCourseImportPreviewState> {
  try {
    const actor = await getDailyCourseActor();
    const content = await readDailyCourseImportContent(formData);
    const preview = await previewDailyCourseImportFile(actor, { content });
    return { success: true, content, preview };
  } catch (error) {
    logger.error("Ошибка предпросмотра импорта курса дня", error as Error);
    return {
      success: false,
      error: error instanceof Error ? mapDailyCourseError(error.message) : "Неизвестная ошибка",
    };
  }
}

export async function confirmDailyCourseImportAction(
  _prevState: DailyCourseImportConfirmState,
  formData: FormData,
): Promise<DailyCourseImportConfirmState> {
  try {
    const actor = await getDailyCourseActor();
    const content = await readDailyCourseImportContent(formData);
    const replaceConflicts = formData.get("replaceConflicts")?.toString() === "true";
    const result = await importDailyCourseFile(actor, { content, replaceConflicts });
    revalidatePath("/main-panel/daily-course");
    revalidatePath("/main-panel/daily-course/bundles");
    return { success: true, result };
  } catch (error) {
    logger.error("Ошибка импорта курса дня", error as Error);
    return {
      success: false,
      error: error instanceof Error ? mapDailyCourseError(error.message) : "Неизвестная ошибка",
    };
  }
}

export async function previewDailyCourseCleanupAction(
  _prevState: DailyCourseCleanupPreviewState,
  formData: FormData,
): Promise<DailyCourseCleanupPreviewState> {
  try {
    const actor = await getDailyCourseActor();
    const mode = parseDailyCourseCleanupMode(formData);
    const preview = await previewDailyCourseCleanup(actor, { mode });
    return { success: true, preview };
  } catch (error) {
    logger.error("Ошибка предпросмотра очистки курса дня", error as Error);
    return {
      success: false,
      error: error instanceof Error ? mapDailyCourseError(error.message) : "Неизвестная ошибка",
    };
  }
}

export async function confirmDailyCourseCleanupAction(
  _prevState: DailyCourseCleanupConfirmState,
  formData: FormData,
): Promise<DailyCourseCleanupConfirmState> {
  try {
    const actor = await getDailyCourseActor();
    const mode = parseDailyCourseCleanupMode(formData);
    const confirmation = formData.get("confirmation")?.toString() ?? "";
    const result = await cleanupDailyCourseContent(actor, { mode, confirmation });
    revalidatePath("/main-panel/daily-course");
    revalidatePath("/main-panel/daily-course/bundles");
    revalidatePath("/main-panel/daily-course/steps");
    return { success: true, result };
  } catch (error) {
    logger.error("Ошибка очистки курса дня", error as Error);
    return {
      success: false,
      error: error instanceof Error ? mapDailyCourseError(error.message) : "Неизвестная ошибка",
    };
  }
}

async function readDailyCourseImportContent(formData: FormData): Promise<string> {
  const inlineContent = formData.get("content")?.toString() ?? "";
  if (inlineContent.trim().length > 0) return inlineContent;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("DAILY_COURSE_IMPORT_EMPTY_FILE");
  }
  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    throw new Error("DAILY_COURSE_IMPORT_FILE_TOO_LARGE");
  }
  if (!/\.(md|txt)$/i.test(file.name)) {
    throw new Error("DAILY_COURSE_IMPORT_UNSUPPORTED_FILE");
  }
  return file.text();
}

function parseDailyCourseCleanupMode(formData: FormData): DailyCourseCleanupMode {
  const mode = formData.get("mode")?.toString();
  if (mode === "future" || mode === "all") return mode;
  throw new Error("DAILY_COURSE_CLEANUP_INVALID_MODE");
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
      return "В курсе дня можно использовать только тренировку, упражнение, теорию, экзамен и перерыв";
    case "DAILY_COURSE_INVALID_REPORT_STEP":
      return "Отчёты и тесты поддерживаются только в экзаменационных шагах";
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
    case "DAILY_COURSE_IMPORT_EMPTY_FILE":
      return "Выберите .md или .txt файл либо вставьте текст импорта";
    case "DAILY_COURSE_IMPORT_FILE_TOO_LARGE":
      return "Файл импорта должен быть не больше 1 МБ";
    case "DAILY_COURSE_IMPORT_UNSUPPORTED_FILE":
      return "Поддерживаются только файлы .md и .txt";
    case "DAILY_COURSE_CLEANUP_INVALID_MODE":
      return "Выберите режим очистки курса дня";
    case "DAILY_COURSE_CLEANUP_CONFIRMATION_REQUIRED":
      return "Для очистки курса дня введите точное подтверждение";
    default:
      return code;
  }
}
