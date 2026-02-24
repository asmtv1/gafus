"use server";

import { appendFileSync } from "fs";
import { join } from "path";

const DEBUG_LOG = join(process.cwd(), "create-course-debug.log");

function debugLog(msg: string, data?: unknown) {
  const line = `[${new Date().toISOString()}] ${msg}${data != null ? " " + JSON.stringify(data) : ""}\n`;
  try {
    appendFileSync(DEBUG_LOG, line);
  } catch {
    // ignore
  }
}

debugLog("courses.ts module loaded");

import {
  deleteFileFromCDN,
  uploadFileToCDN,
  getRelativePathFromCDNUrl,
  getCourseImagePath,
} from "@gafus/cdn-upload";
import { authOptions } from "@gafus/auth";
import { getServerSession } from "next-auth";
import { revalidatePath, revalidateTag } from "next/cache";
import { randomUUID } from "crypto";
import { createTrainerPanelLogger } from "@gafus/logger";
import { CACHE_TAGS } from "@gafus/core/services/cache";
import {
  createCourse,
  updateCourse,
  deleteCourse,
  canCreatePaidCourse as coreCanCreatePaidCourse,
  createTrainerCourseSchema,
  updateTrainerCourseSchema,
} from "@gafus/core/services/trainerCourse";
import { invalidateCoursesCache } from "./invalidateCoursesCache";
import { invalidateTrainingDaysCache } from "./invalidateTrainingDaysCache";

const logger = createTrainerPanelLogger("trainer-panel-create-course");

export interface CreateCourseInput {
  name: string;
  shortDesc: string;
  description: string;
  duration: string;
  videoUrl?: string;
  logoImg: string;
  isPublic: boolean;
  isPaid: boolean;
  priceRub: number | null;
  showInProfile: boolean;
  isPersonalized: boolean;
  trainingDays: string[];
  allowedUsers: string[];
  equipment: string;
  trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
}

export async function createCourseServerAction(formData: FormData) {
  debugLog("createCourse: ENTRY");
  try {
    const session = (await getServerSession(authOptions)) as {
      user: { id: string; username: string; role: string };
    } | null;
    debugLog("createCourse: session", { hasSession: !!session?.user?.id });
    if (!session?.user?.id) {
      return { success: false, error: "Не авторизован" };
    }

    const authorId = session.user.id;
    const trainerId = authorId;

    const name = formData.get("name")?.toString() || "";
    const shortDesc = formData.get("shortDesc")?.toString() || "";
    const description = formData.get("description")?.toString() || "";
    const duration = formData.get("duration")?.toString() || "";
    const videoUrl = formData.get("videoUrl")?.toString();
    const isPublic = formData.get("isPublic")?.toString() === "true";
    const isPaid = formData.get("isPaid")?.toString() === "true";
    const priceRubRaw = formData.get("priceRub")?.toString();
    const priceRub = priceRubRaw ? parseFloat(priceRubRaw) : null;
    if (isPaid) {
      if (
        !coreCanCreatePaidCourse(
          session.user.id,
          session.user.role,
          session.user.username ?? "",
        )
      ) {
        return {
          success: false,
          error:
            "Создавать платные курсы могут только администратор и тренер gafus",
        };
      }
      if (
        priceRub == null ||
        Number.isNaN(priceRub) ||
        priceRub < 1 ||
        priceRub > 999_999
      ) {
        return {
          success: false,
          error: "Для платного курса укажите цену от 1 до 999 999 ₽",
        };
      }
    }
    const showInProfile = formData.get("showInProfile")?.toString() === "true";
    const isPersonalized =
      formData.get("isPersonalized")?.toString() === "true";
    const trainingDays = formData.getAll("trainingDays").map(String);
    const allowedUsers = formData.getAll("allowedUsers").map(String);
    const equipment = formData.get("equipment")?.toString() || "";
    const trainingLevel =
      (formData.get("trainingLevel")?.toString() as
        | "BEGINNER"
        | "INTERMEDIATE"
        | "ADVANCED"
        | "EXPERT") || "BEGINNER";
    const logoFile = formData.get("logoImg") as File | null;
    debugLog("createCourse: form parsed", {
      name,
      trainingDaysCount: trainingDays.length,
      logoFile: logoFile ? `${logoFile.name} ${logoFile.size}b` : "none",
    });

    const uuid = randomUUID();
    let logoImgUrl = "";
    if (logoFile && logoFile.size > 0) {
      try {
        debugLog("createCourse: uploading logo to CDN");
        const ext = logoFile.name.split(".").pop() || "jpg";
        const relativePath = getCourseImagePath(trainerId, uuid, uuid, ext);
        logoImgUrl = await uploadFileToCDN(logoFile, relativePath);
        debugLog("createCourse: logo uploaded", { logoImgUrl });
      } catch (error) {
        debugLog("createCourse: CDN upload error", {
          err: error instanceof Error ? error.message : String(error),
        });
        return { success: false, error: "Не удалось загрузить изображение курса" };
      }
    }

    const parseResult = createTrainerCourseSchema.safeParse({
      id: uuid,
      name,
      shortDesc,
      description,
      duration,
      videoUrl: videoUrl || null,
      logoImg: logoImgUrl,
      isPublic,
      isPaid,
      priceRub: isPaid ? priceRub : null,
      showInProfile,
      isPersonalized,
      trainingDays,
      allowedUsers,
      equipment,
      trainingLevel,
    });
    if (!parseResult.success) {
      const msg = parseResult.error.flatten().formErrors[0] ?? "Ошибка валидации";
      debugLog("createCourse: validation failed", parseResult.error.flatten());
      if (logoImgUrl) {
        try {
          await deleteFileFromCDN(getRelativePathFromCDNUrl(logoImgUrl));
        } catch {
          // игнорируем ошибку отката CDN
        }
      }
      return { success: false, error: msg };
    }

    debugLog("createCourse: calling createCourse (DB)");
    const result = await createCourse(parseResult.data, authorId);
    debugLog("createCourse: createCourse result", {
      success: result.success,
      error: result.error,
      id: result.id,
    });
    if (!result.success) {
      if (logoImgUrl) {
        try {
          await deleteFileFromCDN(getRelativePathFromCDNUrl(logoImgUrl));
        } catch {
          // откат CDN при ошибке core
        }
      }
      return { success: false, error: result.error };
    }

    debugLog("createCourse: invalidating cache");
    revalidateTag(CACHE_TAGS.STATISTICS);
    revalidatePath("/main-panel/statistics");
    await invalidateCoursesCache();
    debugLog("createCourse: invalidateCoursesCache done");
    await invalidateTrainingDaysCache(result.id);
    debugLog("createCourse: invalidateTrainingDaysCache done, SUCCESS");

    return { success: true, id: result.id };
  } catch (err) {
    debugLog("createCourse: CAUGHT ERROR", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Неизвестная ошибка при создании курса",
    };
  }
}

export interface UpdateCourseInput extends CreateCourseInput {
  id: string;
}

export async function updateCourseServerAction(input: UpdateCourseInput) {
  const session = (await getServerSession(authOptions)) as {
    user: { id: string; username: string; role: string };
  } | null;
  if (!session?.user?.id) return { success: false, error: "Не авторизован" };

  if (input.isPaid) {
    if (
      !coreCanCreatePaidCourse(
        session.user.id,
        session.user.role,
        session.user.username ?? "",
      )
    ) {
      return {
        success: false,
        error:
          "Создавать платные курсы могут только администратор и тренер gafus",
      };
    }
  }
  if (
    input.isPaid &&
    (input.priceRub == null || input.priceRub < 1 || input.priceRub > 999_999)
  ) {
    return {
      success: false,
      error: "Для платного курса укажите цену от 1 до 999 999 ₽",
    };
  }

  const parseResult = updateTrainerCourseSchema.safeParse({
    id: input.id,
    name: input.name,
    shortDesc: input.shortDesc,
    description: input.description,
    duration: input.duration,
    videoUrl: input.videoUrl ?? null,
    logoImg: input.logoImg,
    isPublic: input.isPublic,
    isPaid: input.isPaid,
    priceRub: input.priceRub,
    showInProfile: input.showInProfile,
    isPersonalized: input.isPersonalized,
    trainingDays: input.trainingDays,
    allowedUsers: input.allowedUsers,
    equipment: input.equipment,
    trainingLevel: input.trainingLevel,
  });
  if (!parseResult.success) {
    const msg = parseResult.error.flatten().formErrors[0] ?? "Ошибка валидации";
    return { success: false, error: msg };
  }

  const result = await updateCourse(parseResult.data);
  if (!result.success) return { success: false, error: result.error };

  revalidateTag(CACHE_TAGS.STATISTICS);
  revalidatePath("/main-panel/statistics");
  await invalidateCoursesCache();
  await invalidateTrainingDaysCache(input.id);

  return { success: true };
}

export async function deleteCourseServerAction(courseId: string) {
  const session = (await getServerSession(authOptions)) as {
    user: { id: string; username: string; role: string };
  } | null;
  if (!session?.user?.id) return { success: false, error: "Не авторизован" };

  const result = await deleteCourse(courseId);
  if (!result.success) return { success: false, error: result.error };

  if (result.logoImg) {
    try {
      const relativePath = getRelativePathFromCDNUrl(result.logoImg);
      await deleteFileFromCDN(relativePath);
      logger.info(`Изображение курса удалено из CDN: ${relativePath}`);
    } catch (error) {
      logger.warn("Не удалось удалить изображение курса из CDN", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  revalidateTag(CACHE_TAGS.STATISTICS);
  revalidatePath("/main-panel/statistics");
  await invalidateCoursesCache();
  await invalidateTrainingDaysCache(courseId);

  return { success: true };
}
