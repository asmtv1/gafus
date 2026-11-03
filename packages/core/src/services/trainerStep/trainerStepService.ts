/**
 * Trainer Step Service — бизнес-логика шагов и шаблонов тренера.
 * Чистая логика без Next.js и CDN; app отвечает за сессию, CDN и revalidate.
 */

import { prisma } from "@gafus/prisma";
import { Prisma } from "@gafus/prisma";
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
async function ownsSelectedLibraryVideos(urls: string[] | undefined, actorId: string) {
  if (!urls?.length) return true;
  const selected = new Map<string, string>();
  for (const raw of urls) {
    let url: URL;
    try { url = new URL(raw); } catch { return false; }
    if (url.protocol !== "https:" || url.username || url.password) return false;
    if (url.hostname !== "gafus-media.storage.yandexcloud.net") continue;
    if (url.search || url.hash || url.port) return false;
    const match = /^\/uploads\/trainers\/([A-Za-z0-9_-]{1,128})\/videocourses\/([A-Za-z0-9_-]{1,128})\/(?:original\.[a-zA-Z0-9]{2,8}|hls\/[A-Za-z0-9._-]{1,128}\.m3u8)$/.exec(url.pathname);
    if (!match || match[1] !== actorId || selected.has(match[2]!)) return false;
    selected.set(match[2]!, raw);
  }
  if (!selected.size) return true;
  const owned = await prisma.trainerVideo.findMany({
    where: { id: { in: [...selected.keys()] }, trainerId: actorId,
      transcodingStatus: "COMPLETED" },
    select: { id: true, relativePath: true, hlsManifestPath: true },
  });
  return owned.length === selected.size && owned.every(video =>
    video.hlsManifestPath &&
    selected.get(video.id) ===
      `https://gafus-media.storage.yandexcloud.net/${video.relativePath}`);
}


/** Return only the validated data needed by the trainer edit form. */
export type TrainerStepMutationActor = { id: string; role: "TRAINER" | "ADMIN" };

export async function getStepForEdit(id: string, actor?: TrainerStepMutationActor) {
  const step = await prisma.step.findUnique({
    where: { id, ...(actor?.role === "TRAINER" ? { authorId: actor.id } : {}) },
    select: {
      id: true,
      title: true,
      description: true,
      durationSec: true,
      estimatedDurationSec: true,
      videoUrl: true,
      videoUrls: true,
      type: true,
      imageUrls: true,
      pdfUrls: true,
      checklist: true,
      requiresVideoReport: true,
      requiresWrittenFeedback: true,
      hasTestQuestions: true,
      isDailyCourse: true,
      surveySlug: true,
    },
  });
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

export async function getTrainerStepMediaState(id: string) {
  return prisma.step.findUnique({ where: { id }, select: { imageUrls: true } });
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
const visibleStepsSelect = {
  id: true,
  title: true,
  description: true,
  durationSec: true,
  estimatedDurationSec: true,
  type: true,
  videoUrl: true,
  videoUrls: true,
  imageUrls: true,
  pdfUrls: true,
  checklist: true,
  surveySlug: true,
  isDailyCourse: true,
  authorId: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: {
      username: true,
      profile: { select: { fullName: true } },
    },
  },
  stepLinks: {
    include: {
      day: {
        include: {
          dayLinks: {
            include: {
              course: {
                select: { id: true, name: true, shortDesc: true, logoImg: true },
              },
            },
          },
        },
      },
    },
  },
} as const;

/**
 * Создание шага. Принимает id (UUID от app) и imageUrls (готовые CDN URL).
 */
export async function createStep(
  input: CreateStepInput,
  authorId: string,
): Promise<ActionResult> {
  try {
    if (!(await ownsSelectedLibraryVideos(input.videoUrls, authorId)))
      return { success: false, error: "FORBIDDEN_VIDEO" };
    const checklistValue =
      input.hasTestQuestions && input.checklist && input.checklist.length > 0
        ? input.checklist
        : Prisma.JsonNull;

    await prisma.step.create({
      data: {
        id: input.id,
        title: input.title,
        description: input.description,
        durationSec: input.durationSec,
        estimatedDurationSec: input.estimatedDurationSec ?? null,
        type: input.type as "TRAINING" | "EXAMINATION" | "THEORY" | "BREAK" | "PRACTICE" | "DIARY" | "SURVEY",
        videoUrl:
          ["TRAINING", "THEORY", "PRACTICE", "EXAMINATION"].includes(input.type)
            ? input.videoUrl || null
            : null,
        videoUrls: ["TRAINING", "THEORY", "PRACTICE", "EXAMINATION"].includes(input.type)
          ? (input.videoUrls ?? (input.videoUrl ? [input.videoUrl] : [])) : [],
        imageUrls: input.imageUrls ?? [],
        pdfUrls:
          input.type === "TRAINING" || input.type === "THEORY" || input.type === "PRACTICE"
            ? input.pdfUrls ?? []
            : [],
        checklist: checklistValue,
        requiresVideoReport: input.type === "EXAMINATION" ? input.requiresVideoReport : false,
        requiresWrittenFeedback:
          input.type === "EXAMINATION" ? input.requiresWrittenFeedback : false,
        hasTestQuestions: input.type === "EXAMINATION" ? input.hasTestQuestions : false,
        surveySlug: input.type === "SURVEY" ? input.surveySlug : null,
        isDailyCourse: input.isDailyCourse,
        authorId,
      },
    });

    logger.info("Шаг создан", { stepId: input.id, authorId });
    return { success: true };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Шаг");
      } catch (serviceError) {
        const msg =
          serviceError instanceof Error
            ? serviceError.message
            : "Ошибка при создании шага";
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
): Promise<ActionResult> {
  try {
    if (input.videoUrls && (!actor ||
        !(await ownsSelectedLibraryVideos(input.videoUrls, actor.id))))
      return { success: false, error: "FORBIDDEN_VIDEO" };
    const checklistValue =
      input.hasTestQuestions && input.checklist && input.checklist.length > 0
        ? input.checklist
        : Prisma.JsonNull;

    await prisma.step.update({
      where: { id: input.id, ...(actor?.role === "TRAINER" ? { authorId: actor.id } : {}) },
      data: {
        title: input.title,
        description: input.description,
        durationSec: input.durationSec ?? null,
        estimatedDurationSec: input.estimatedDurationSec ?? null,
        type: input.type as "TRAINING" | "EXAMINATION" | "THEORY" | "BREAK" | "PRACTICE" | "DIARY" | "SURVEY",
        videoUrl:
          ["TRAINING", "THEORY", "PRACTICE", "EXAMINATION"].includes(input.type)
            ? input.videoUrl || null
            : null,
        videoUrls: ["TRAINING", "THEORY", "PRACTICE", "EXAMINATION"].includes(input.type)
          ? (input.videoUrls ?? (input.videoUrl ? [input.videoUrl] : [])) : [],
        imageUrls: input.imageUrls ?? [],
        pdfUrls:
          input.type === "TRAINING" || input.type === "THEORY" || input.type === "PRACTICE"
            ? input.pdfUrls ?? []
            : [],
        checklist: checklistValue,
        requiresVideoReport: input.type === "EXAMINATION" ? input.requiresVideoReport : false,
        requiresWrittenFeedback:
          input.type === "EXAMINATION" ? input.requiresWrittenFeedback : false,
        hasTestQuestions: input.type === "EXAMINATION" ? input.hasTestQuestions : false,
        surveySlug: input.type === "SURVEY" ? input.surveySlug : null,
        isDailyCourse: input.isDailyCourse,
      },
    });

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
          serviceError instanceof Error
            ? serviceError.message
            : "Ошибка при обновлении шага";
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
): Promise<DeleteStepsResult> {
  try {
    if (actor) {
      // The old Next action uses the legacy unrestricted path below.
      // The new Hono surface must check all IDs AND delete them atomically.
      const uniqueIds = [...new Set(input.stepIds)];
      if (uniqueIds.length !== input.stepIds.length) return { success: false };
      const where = { id: { in: uniqueIds },
        ...(actor.role === "TRAINER" ? { authorId: actor.id } : {}) };
      const removed = await prisma.$transaction(async (tx) => {
        const targets = await tx.step.findMany({
          where, select: { id: true, imageUrls: true },
        });
        if (targets.length !== uniqueIds.length) throw Error("STEP_NOT_FOUND");
        const outcome = await tx.step.deleteMany({ where });
        if (outcome.count !== uniqueIds.length) throw Error("STEP_DELETE_RACE");
        return targets;
      });
      invalidateStepsContentCache(uniqueIds);
      await publishCourseContentChange();
      return { success: true, imageUrls: removed.flatMap(row => row.imageUrls) };
    }
    const stepsToDelete = await prisma.step.findMany({
      where: { id: { in: input.stepIds } },
      select: { id: true, imageUrls: true },
    });

    const allImageUrls = stepsToDelete.flatMap((s) => s.imageUrls);

    await prisma.step.deleteMany({ where: { id: { in: input.stepIds } } });

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
) {
  const isDailyCourse = options.isDailyCourse ?? false;
  const where = isAdminOrModerator
    ? { isDailyCourse }
    : { authorId: authorId!, isDailyCourse };
  return prisma.step.findMany({
    where,
    select: visibleStepsSelect,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Удаление одного URL из imageUrls шага (для deleteStepImageServerAction).
 */
export async function removeStepImageUrl(
  stepId: string,
  imageUrl: string,
): Promise<ActionResult> {
  try {
    const step = await prisma.step.findUnique({
      where: { id: stepId },
      select: { imageUrls: true },
    });
    if (!step) {
      return { success: false, error: "Шаг не найден" };
    }
    const nextUrls = step.imageUrls.filter((u) => u !== imageUrl);
    if (nextUrls.length === step.imageUrls.length) {
      return { success: true };
    }
    await prisma.step.update({
      where: { id: stepId },
      data: { imageUrls: nextUrls },
    });
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
      error:
        error instanceof Error ? error.message : "Не удалось обновить шаг",
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

export async function getStepTemplates(
  categoryId?: string,
): Promise<StepTemplateWithCategory[]> {
  const templates = await prisma.stepTemplate.findMany({
    where: {
      isPublic: true,
      ...(categoryId ? { categoryId } : {}),
    },
    include: {
      category: { select: { id: true, name: true, icon: true } },
      author: { select: { id: true, username: true } },
    },
    orderBy: [{ usageCount: "desc" }, { createdAt: "desc" }],
  });
  return templates.map((t) => ({ ...t, type: t.type as string }));
}

export async function getStepTemplateById(
  id: string,
): Promise<StepTemplateWithCategory | null> {
  const template = await prisma.stepTemplate.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, icon: true } },
      author: { select: { id: true, username: true } },
    },
  });
  if (!template) return null;
  return { ...template, type: template.type as string };
}

export async function searchStepTemplates(
  query: string,
): Promise<StepTemplateWithCategory[]> {
  const templates = await prisma.stepTemplate.findMany({
    where: {
      isPublic: true,
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { tags: { has: query.toLowerCase() } },
      ],
    },
    include: {
      category: { select: { id: true, name: true, icon: true } },
      author: { select: { id: true, username: true } },
    },
    orderBy: { usageCount: "desc" },
    take: 20,
  });
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

export async function getStepCategories(): Promise<StepCategoryWithCount[]> {
  const categories = await prisma.stepCategory.findMany({
    include: {
      _count: {
        select: {
          templates: { where: { isPublic: true } },
        },
      },
    },
    orderBy: { order: "asc" },
  });
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
): Promise<CreateStepFromTemplateResult> {
  try {
    const template = await prisma.stepTemplate.findUnique({
      where: { id: input.templateId },
    });
    if (!template) {
      return { success: false, error: "Шаблон не найден" };
    }
    if (!template.isPublic && template.authorId !== input.authorId) {
      return { success: false, error: "Доступ к этому шаблону запрещен" };
    }

    const step = await prisma.$transaction(async (tx) => {
      const created = await tx.step.create({
        data: {
          title: template.title,
          description: template.description,
          durationSec: template.durationSec,
          estimatedDurationSec: template.estimatedDurationSec,
          type: template.type,
          imageUrls: template.imageUrls,
          pdfUrls: template.pdfUrls,
          videoUrl: template.videoUrl,
          checklist: template.checklist ?? undefined,
          requiresVideoReport: template.requiresVideoReport,
          requiresWrittenFeedback: template.requiresWrittenFeedback,
          hasTestQuestions: template.hasTestQuestions,
          surveySlug: template.surveySlug,
          authorId: input.authorId,
        },
      });
      await tx.stepTemplate.update({
        where: { id: input.templateId },
        data: { usageCount: { increment: 1 } },
      });
      return created;
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
      error:
        error instanceof Error
          ? error.message
          : "Не удалось создать шаг из шаблона",
    };
  }
}

/** Удаление шаблона (ADMIN — проверка в app). */
export async function deleteStepTemplate(
  templateId: string,
): Promise<ActionResult> {
  try {
    await prisma.stepTemplate.delete({ where: { id: templateId } });
    logger.info("Шаблон удалён", { templateId });
    return { success: true };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Шаблон");
      } catch (serviceError) {
        const msg =
          serviceError instanceof Error
            ? serviceError.message
            : "Не удалось удалить шаблон";
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
}): Promise<ActionResult & { templateId?: string }> {
  try {
    const template = await prisma.stepTemplate.create({
      data: {
        title: data.title,
        description: data.description,
        durationSec: data.durationSec,
        type: data.type as "TRAINING" | "EXAMINATION",
        categoryId: data.categoryId || undefined,
        tags: data.tags,
        videoUrl: data.videoUrl,
        authorId: data.authorId,
        isPublic: true,
      },
    });
    logger.info("Шаблон создан", { templateId: template.id });
    return { success: true, templateId: template.id };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Шаблон");
      } catch (serviceError) {
        const msg =
          serviceError instanceof Error
            ? serviceError.message
            : "Не удалось создать шаблон";
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
}): Promise<ActionResult> {
  try {
    await prisma.stepCategory.create({
      data: {
        name: data.name,
        description: data.description,
        icon: data.icon,
        order: data.order,
      },
    });
    logger.info("Категория шаблонов создана", { name: data.name });
    return { success: true };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Категория");
      } catch (serviceError) {
        const msg =
          serviceError instanceof Error
            ? serviceError.message
            : "Не удалось создать категорию";
        return { success: false, error: msg };
      }
    }
    logger.error("Ошибка при создании категории", error as Error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Не удалось создать категорию",
    };
  }
}
