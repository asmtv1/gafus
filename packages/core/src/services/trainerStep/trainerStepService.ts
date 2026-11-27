/**
 * Trainer Step Service — бизнес-логика шагов и шаблонов тренера.
 * Чистая логика без Next.js и CDN; app отвечает за сессию, CDN и revalidate.
 */

import {
  requireTrainerStepRowsPort,
  type TrainerStepRowsPort,
} from "./trainerStepRowsPort";
import { createWebLogger } from "@gafus/logger";
import type { ActionResult } from "@gafus/types";
import { handlePrismaError } from "@gafus/core/errors";
import { invalidateStepsContentCache } from "../training/trainingDayContent";
import { publishCourseContentChange } from "../training/trainingContentRevision";
import type {
  CreateStepInput,
  UpdateStepInput,
  DeleteStepsInput,
  CreateStepFromTemplateInput,
} from "./schemas";
import { checklistSchema } from "./schemas";

const logger = createWebLogger("trainer-step");

/** A selected own-library URL is a durable pointer, not a playback ticket.
 * Authenticate the owner AND the exact storage object before attachment.
 * External https links continue to work as before (the learner player handles them).
 */
async function ownsSelectedLibraryVideos(urls: string[] | undefined, actorId: string, rowsPort?: TrainerStepRowsPort) {
  if (!urls?.length) return true;
  const selected = new Map<string, string>();
  for (const raw of urls) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return false;
    }
    if (url.protocol !== "https:" || url.username || url.password) return false;
    if (url.hostname !== "gafus-media.storage.yandexcloud.net") continue;
    if (url.search || url.hash || url.port) return false;
    const match =
      /^\/uploads\/trainers\/([A-Za-z0-9_-]{1,128})\/videocourses\/([A-Za-z0-9_-]{1,128})\/(?:original\.[a-zA-Z0-9]{2,8}|hls\/[A-Za-z0-9._-]{1,128}\.m3u8)$/.exec(
        url.pathname,
      );
    if (!match || match[1] !== actorId || selected.has(match[2]!)) return false;
    selected.set(match[2]!, raw);
  }
  if (!selected.size) return true;
  const owned = await requireTrainerStepRowsPort(rowsPort).readTrainerVideoRows([...selected.keys()], actorId);
  return (
    owned.length === selected.size &&
    owned.every(
      (video) =>
        video.hlsManifestPath &&
        selected.get(video.id) ===
          `https://gafus-media.storage.yandexcloud.net/${video.relativePath}`,
    )
  );
}

/** Return only the validated data needed by the trainer edit form. */
export type TrainerStepMutationActor = { id: string; role: "TRAINER" | "ADMIN" };

export async function getStepForEdit(id: string, actor?: TrainerStepMutationActor, rowsPort?: TrainerStepRowsPort) {
  const step = await requireTrainerStepRowsPort(rowsPort).readTrainerStepForEdit(id, actor);
  if (!step) return null;
  const parsedChecklist = checklistSchema.safeParse(step.checklist);
  return {
    id: step.id,
    title: step.title,
    description: step.description,
    durationSec: step.durationSec ?? undefined,
    estimatedDurationSec: step.estimatedDurationSec ?? null,
    videoUrl: step.videoUrl,
    videoUrls: step.videoUrls?.length ? step.videoUrls : step.videoUrl ? [step.videoUrl] : [],
    type: step.type,
    imageUrls: step.imageUrls,
    pdfUrls: step.pdfUrls,
    checklist: parsedChecklist.success ? parsedChecklist.data : [],
    requiresVideoReport: step.requiresVideoReport,
    requiresWrittenFeedback: step.requiresWrittenFeedback,
    hasTestQuestions: step.hasTestQuestions,
    isDailyCourse: step.isDailyCourse,
    surveySlug: step.surveySlug,
  };
}

export async function getTrainerStepMediaState(id: string, rowsPort?: TrainerStepRowsPort) {
  return requireTrainerStepRowsPort(rowsPort).readTrainerStepMediaRow(id);
}

/** Результат успешного удаления шагов (imageUrls для удаления из CDN в app) */
export interface DeleteStepsResult extends ActionResult {
  imageUrls?: string[];
}

/** Результат createStepFromTemplate */
export interface CreateStepFromTemplateResult extends ActionResult {
  stepId?: string;
}

/** Селект для видимых шагов (как в getVisibleSteps) */

/**
 * Создание шага. Принимает id (UUID от app) и imageUrls (готовые CDN URL).
 */
export async function createStep(input: CreateStepInput, authorId: string, rowsPort?: TrainerStepRowsPort): Promise<ActionResult> {
  try {
    if (!(await ownsSelectedLibraryVideos(input.videoUrls, authorId, rowsPort)))
      return { success: false, error: "FORBIDDEN_VIDEO" };
    const checklistValue =
      input.hasTestQuestions && input.checklist && input.checklist.length > 0
        ? input.checklist
        : null;

    await requireTrainerStepRowsPort(rowsPort).createTrainerStepRecord({
      id: input.id,
      title: input.title,
      description: input.description,
      durationSec: input.durationSec,
      estimatedDurationSec: input.estimatedDurationSec ?? null,
      type: input.type as
        | "TRAINING"
        | "EXAMINATION"
        | "THEORY"
        | "BREAK"
        | "PRACTICE"
        | "DIARY"
        | "SURVEY",
      videoUrl: ["TRAINING", "THEORY", "PRACTICE", "EXAMINATION"].includes(input.type)
        ? input.videoUrl || null
        : null,
      videoUrls: ["TRAINING", "THEORY", "PRACTICE", "EXAMINATION"].includes(input.type)
        ? (input.videoUrls ?? (input.videoUrl ? [input.videoUrl] : []))
        : [],
      imageUrls: input.imageUrls ?? [],
      pdfUrls:
        input.type === "TRAINING" || input.type === "THEORY" || input.type === "PRACTICE"
          ? (input.pdfUrls ?? [])
          : [],
      checklist: checklistValue,
      requiresVideoReport: input.type === "EXAMINATION" ? input.requiresVideoReport : false,
      requiresWrittenFeedback: input.type === "EXAMINATION" ? input.requiresWrittenFeedback : false,
      hasTestQuestions: input.type === "EXAMINATION" ? input.hasTestQuestions : false,
      surveySlug: input.type === "SURVEY" ? input.surveySlug : null,
      isDailyCourse: input.isDailyCourse,
      authorId,
    });

    logger.info("Шаг создан", { stepId: input.id, authorId });
    return { success: true };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Шаг");
      } catch (serviceError) {
        const msg =
          serviceError instanceof Error ? serviceError.message : "Ошибка при создании шага";
        return { success: false, error: msg };
      }
    }
    logger.error("Ошибка при создании шага", error as Error, {
      authorId,
      stepId: input.id,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось создать шаг",
    };
  }
}

/**
 * Обновление шага. imageUrls — полный итоговый массив (существующие + новые URL).
 */
export async function updateStep(
  input: UpdateStepInput,
  actor?: TrainerStepMutationActor,
  rowsPort?: TrainerStepRowsPort,
): Promise<ActionResult> {
  try {
    if (
      input.videoUrls &&
      (!actor || !(await ownsSelectedLibraryVideos(input.videoUrls, actor.id, rowsPort)))
    )
      return { success: false, error: "FORBIDDEN_VIDEO" };
    const checklistValue =
      input.hasTestQuestions && input.checklist && input.checklist.length > 0
        ? input.checklist
        : null;

    await requireTrainerStepRowsPort(rowsPort).updateTrainerStepRecord(
      { id: input.id, ...(actor?.role === "TRAINER" ? { authorId: actor.id } : {}) },
      {
        title: input.title,
        description: input.description,
        durationSec: input.durationSec ?? null,
        estimatedDurationSec: input.estimatedDurationSec ?? null,
        type: input.type as
          | "TRAINING"
          | "EXAMINATION"
          | "THEORY"
          | "BREAK"
          | "PRACTICE"
          | "DIARY"
          | "SURVEY",
        videoUrl: ["TRAINING", "THEORY", "PRACTICE", "EXAMINATION"].includes(input.type)
          ? input.videoUrl || null
          : null,
        videoUrls: ["TRAINING", "THEORY", "PRACTICE", "EXAMINATION"].includes(input.type)
          ? (input.videoUrls ?? (input.videoUrl ? [input.videoUrl] : []))
          : [],
        imageUrls: input.imageUrls ?? [],
        pdfUrls:
          input.type === "TRAINING" || input.type === "THEORY" || input.type === "PRACTICE"
            ? (input.pdfUrls ?? [])
            : [],
        checklist: checklistValue,
        requiresVideoReport: input.type === "EXAMINATION" ? input.requiresVideoReport : false,
        requiresWrittenFeedback:
          input.type === "EXAMINATION" ? input.requiresWrittenFeedback : false,
        hasTestQuestions: input.type === "EXAMINATION" ? input.hasTestQuestions : false,
        surveySlug: input.type === "SURVEY" ? input.surveySlug : null,
        isDailyCourse: input.isDailyCourse,
      },
    );

    invalidateStepsContentCache([input.id]);
    await publishCourseContentChange();
    logger.info("Шаг обновлён", { stepId: input.id });
    return { success: true };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Шаг");
      } catch (serviceError) {
        const msg =
          serviceError instanceof Error ? serviceError.message : "Ошибка при обновлении шага";
        return { success: false, error: msg };
      }
    }
    logger.error("Ошибка при обновлении шага", error as Error, { stepId: input.id });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось обновить шаг",
    };
  }
}

/**
 * Удаление шагов. Возвращает imageUrls удалённых шагов для последующего удаления в CDN в app.
 */
export async function deleteSteps(
  input: DeleteStepsInput,
  actor?: TrainerStepMutationActor,
  rowsPort?: TrainerStepRowsPort,
): Promise<DeleteStepsResult> {
  try {
    if (actor) {
      // The old Next action uses the legacy unrestricted path below.
      // The new Hono surface must check all IDs AND delete them atomically.
      const uniqueIds = [...new Set(input.stepIds)];
      if (uniqueIds.length !== input.stepIds.length) return { success: false };
      const where = {
        id: { in: uniqueIds },
        ...(actor.role === "TRAINER" ? { authorId: actor.id } : {}),
      };
      const removed = await requireTrainerStepRowsPort(rowsPort).deleteOwnedTrainerStepRows(where, uniqueIds);
      invalidateStepsContentCache(uniqueIds);
      await publishCourseContentChange();
      return { success: true, imageUrls: removed.flatMap((row) => row.imageUrls) };
    }
    const stepsToDelete = await requireTrainerStepRowsPort(rowsPort).readTrainerStepDeletionRows(input.stepIds);

    const allImageUrls = stepsToDelete.flatMap((s) => s.imageUrls);

    await requireTrainerStepRowsPort(rowsPort).deleteLegacyTrainerStepRows(input.stepIds);

    invalidateStepsContentCache(input.stepIds);
    await publishCourseContentChange();
    logger.info("Шаги удалены", { count: input.stepIds.length, stepIds: input.stepIds });
    return { success: true, imageUrls: allImageUrls };
  } catch (error) {
    logger.error("Ошибка при удалении шагов", error as Error, {
      stepIds: input.stepIds,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось удалить шаги",
    };
  }
}

/**
 * Шаги, видимые тренеру. Если isAdminOrModerator — все, иначе только authorId.
 */
export async function getVisibleSteps(
  authorId: string | null,
  isAdminOrModerator: boolean,
  options: { isDailyCourse?: boolean } = {},
  rowsPort?: TrainerStepRowsPort,
) {
  const isDailyCourse = options.isDailyCourse ?? false;
  const where = isAdminOrModerator ? { isDailyCourse } : { authorId: authorId!, isDailyCourse };
  return requireTrainerStepRowsPort(rowsPort).readVisibleTrainerSteps(where);
}

/**
 * Удаление одного URL из imageUrls шага (для deleteStepImageServerAction).
 */
export async function removeStepImageUrl(stepId: string, imageUrl: string, rowsPort?: TrainerStepRowsPort): Promise<ActionResult> {
  try {
    const step = await requireTrainerStepRowsPort(rowsPort).readTrainerStepImageRow(stepId);
    if (!step) {
      return { success: false, error: "Шаг не найден" };
    }
    const nextUrls = step.imageUrls.filter((u) => u !== imageUrl);
    if (nextUrls.length === step.imageUrls.length) {
      return { success: true };
    }
    await requireTrainerStepRowsPort(rowsPort).updateTrainerStepImageRow(stepId, nextUrls);
    invalidateStepsContentCache([stepId]);
    await publishCourseContentChange();
    logger.info("Изображение шага удалено из записи", { stepId });
    return { success: true };
  } catch (error) {
    logger.error("Ошибка при удалении URL изображения шага", error as Error, {
      stepId,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось обновить шаг",
    };
  }
}

// ————— Шаблоны —————

export interface StepTemplateWithCategory {
  id: string;
  title: string;
  description: string;
  durationSec: number | null;
  type: string;
  imageUrls: string[];
  pdfUrls: string[];
  videoUrl: string | null;
  checklist: unknown;
  requiresVideoReport: boolean;
  requiresWrittenFeedback: boolean;
  hasTestQuestions: boolean;
  surveySlug: string | null;
  tags: string[];
  isPublic: boolean;
  usageCount: number;
  category: { id: string; name: string; icon: string | null } | null;
  author: { id: string; username: string };
  createdAt: Date;
}

export async function getStepTemplates(categoryId?: string, rowsPort?: TrainerStepRowsPort): Promise<StepTemplateWithCategory[]> {
  const templates = await requireTrainerStepRowsPort(rowsPort).readPublicTrainerStepTemplates(categoryId);
  return templates.map((t) => ({ ...t, type: t.type as string }));
}

export async function getStepTemplateById(id: string, rowsPort?: TrainerStepRowsPort): Promise<StepTemplateWithCategory | null> {
  const template = await requireTrainerStepRowsPort(rowsPort).readTrainerTemplateForDisplay(id);
  if (!template) return null;
  return { ...template, type: template.type as string };
}

export async function searchStepTemplates(query: string, rowsPort?: TrainerStepRowsPort): Promise<StepTemplateWithCategory[]> {
  const templates = await requireTrainerStepRowsPort(rowsPort).searchPublicTrainerStepTemplates(query);
  return templates.map((t) => ({ ...t, type: t.type as string }));
}

export interface StepCategoryWithCount {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  order: number;
  templateCount: number;
}

export async function getStepCategories(rowsPort?: TrainerStepRowsPort): Promise<StepCategoryWithCount[]> {
  const categories = await requireTrainerStepRowsPort(rowsPort).readPublicTrainerStepCategories();
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    icon: c.icon,
    order: c.order,
    templateCount: c._count.templates,
  }));
}

/**
 * Создание шага из шаблона. Проверка доступа (isPublic или authorId) — в app.
 */
export async function createStepFromTemplate(
  input: CreateStepFromTemplateInput,
  rowsPort?: TrainerStepRowsPort,
): Promise<CreateStepFromTemplateResult> {
  try {
    const template = await requireTrainerStepRowsPort(rowsPort).readTrainerTemplateForCreation(input.templateId);
    if (!template) {
      return { success: false, error: "Шаблон не найден" };
    }
    if (!template.isPublic && template.authorId !== input.authorId) {
      return { success: false, error: "Доступ к этому шаблону запрещен" };
    }

    const step = await requireTrainerStepRowsPort(rowsPort).createStepFromTemplateRow(template, {
      templateId: input.templateId,
      authorId: input.authorId,
    });

    logger.info("Шаг создан из шаблона", {
      stepId: step.id,
      templateId: input.templateId,
      authorId: input.authorId,
    });
    return { success: true, stepId: step.id };
  } catch (error) {
    logger.error("Ошибка при создании шага из шаблона", error as Error, {
      templateId: input.templateId,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось создать шаг из шаблона",
    };
  }
}

/** Удаление шаблона (ADMIN — проверка в app). */
export async function deleteStepTemplate(templateId: string, rowsPort?: TrainerStepRowsPort): Promise<ActionResult> {
  try {
    await requireTrainerStepRowsPort(rowsPort).deleteTrainerTemplateRow(templateId);
    logger.info("Шаблон удалён", { templateId });
    return { success: true };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Шаблон");
      } catch (serviceError) {
        const msg =
          serviceError instanceof Error ? serviceError.message : "Не удалось удалить шаблон";
        return { success: false, error: msg };
      }
    }
    logger.error("Ошибка при удалении шаблона", error as Error, { templateId });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось удалить шаблон",
    };
  }
}

/** Создание шаблона (ADMIN — проверка в app). */
export async function createStepTemplate(data: {
  title: string;
  description: string;
  durationSec: number | null;
  type: string;
  categoryId: string | null;
  tags: string[];
  videoUrl: string | null;
  authorId: string;
}, rowsPort?: TrainerStepRowsPort): Promise<ActionResult & { templateId?: string }> {
  try {
    const template = await requireTrainerStepRowsPort(rowsPort).createTrainerTemplateRow(data);
    logger.info("Шаблон создан", { templateId: template.id });
    return { success: true, templateId: template.id };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Шаблон");
      } catch (serviceError) {
        const msg =
          serviceError instanceof Error ? serviceError.message : "Не удалось создать шаблон";
        return { success: false, error: msg };
      }
    }
    logger.error("Ошибка при создании шаблона", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось создать шаблон",
    };
  }
}

/** Создание категории шаблонов (ADMIN — проверка в app). */
export async function createStepCategory(data: {
  name: string;
  description: string | null;
  icon: string | null;
  order: number;
}, rowsPort?: TrainerStepRowsPort): Promise<ActionResult> {
  try {
    await requireTrainerStepRowsPort(rowsPort).createTrainerStepCategoryRow(data);
    logger.info("Категория шаблонов создана", { name: data.name });
    return { success: true };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Категория");
      } catch (serviceError) {
        const msg =
          serviceError instanceof Error ? serviceError.message : "Не удалось создать категорию";
        return { success: false, error: msg };
      }
    }
    logger.error("Ошибка при создании категории", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось создать категорию",
    };
  }
}
