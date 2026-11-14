/** Trainer step & template SQL adapter: Core retains mutations, validation and DTO mapping. */

import { prisma, Prisma } from "@gafus/prisma";

export type StepMutationActor = { id: string; role: "TRAINER" | "ADMIN" };

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

export function readTrainerVideoRows(selectedIds: string[], actorId: string) {
  return prisma.trainerVideo.findMany({
    where: { id: { in: selectedIds }, trainerId: actorId, transcodingStatus: "COMPLETED" },
    select: { id: true, relativePath: true, hlsManifestPath: true },
  });
}

export function readTrainerStepForEdit(id: string, actor?: StepMutationActor) {
  return prisma.step.findUnique({
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
}

export function readTrainerStepMediaRow(id: string) {
  return prisma.step.findUnique({ where: { id }, select: { imageUrls: true } });
}

export function readTrainerStepImageRow(stepId: string) {
  return prisma.step.findUnique({
    where: { id: stepId },
    select: { imageUrls: true },
  });
}

export function readTrainerStepDeletionRows(stepIds: string[]) {
  return prisma.step.findMany({
    where: { id: { in: stepIds } },
    select: { id: true, imageUrls: true },
  });
}

export function readVisibleTrainerSteps(where: Prisma.StepWhereInput) {
  return prisma.step.findMany({
    where,
    select: visibleStepsSelect,
    orderBy: { createdAt: "desc" },
  });
}

export function createTrainerStepRecord(
  data: Omit<Prisma.StepUncheckedCreateInput, "checklist"> & { checklist: unknown },
) {
  return prisma.step.create({
    data: {
      ...data,
      checklist:
        data.checklist === null ? Prisma.JsonNull : (data.checklist as Prisma.InputJsonValue),
    },
  });
}

export function updateTrainerStepRecord(
  where: Prisma.StepWhereUniqueInput,
  data: Omit<Prisma.StepUpdateInput, "checklist"> & { checklist: unknown },
) {
  return prisma.step.update({
    where,
    data: {
      ...data,
      checklist:
        data.checklist === null ? Prisma.JsonNull : (data.checklist as Prisma.InputJsonValue),
    },
  });
}

export function updateTrainerStepImageRow(stepId: string, nextUrls: string[]) {
  return prisma.step.update({
    where: { id: stepId },
    data: { imageUrls: nextUrls },
  });
}

export function deleteLegacyTrainerStepRows(stepIds: string[]) {
  return prisma.step.deleteMany({ where: { id: { in: stepIds } } });
}

export function deleteOwnedTrainerStepRows(where: Prisma.StepWhereInput, uniqueIds: string[]) {
  return prisma.$transaction(async (tx) => {
    const targets = await tx.step.findMany({
      where,
      select: { id: true, imageUrls: true },
    });
    if (targets.length !== uniqueIds.length) throw Error("STEP_NOT_FOUND");
    const outcome = await tx.step.deleteMany({ where });
    if (outcome.count !== uniqueIds.length) throw Error("STEP_DELETE_RACE");
    return targets;
  });
}

export function readTrainerTemplateForDisplay(id: string) {
  return prisma.stepTemplate.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, icon: true } },
      author: { select: { id: true, username: true } },
    },
  });
}

export function readTrainerTemplateForCreation(templateId: string) {
  return prisma.stepTemplate.findUnique({
    where: { id: templateId },
  });
}

export function readPublicTrainerStepTemplates(categoryId?: string) {
  return prisma.stepTemplate.findMany({
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
}

export function searchPublicTrainerStepTemplates(query: string) {
  return prisma.stepTemplate.findMany({
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
}

export function readPublicTrainerStepCategories() {
  return prisma.stepCategory.findMany({
    include: {
      _count: {
        select: {
          templates: { where: { isPublic: true } },
        },
      },
    },
    orderBy: { order: "asc" },
  });
}

export function createStepFromTemplateRow(
  template: NonNullable<Awaited<ReturnType<typeof prisma.stepTemplate.findUnique>>>,
  input: { templateId: string; authorId: string },
) {
  return prisma.$transaction(async (tx) => {
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
}

export function deleteTrainerTemplateRow(templateId: string) {
  return prisma.stepTemplate.delete({ where: { id: templateId } });
}

export function createTrainerTemplateRow(data: {
  title: string;
  description: string;
  durationSec: number | null;
  type: string;
  categoryId: string | null;
  tags: string[];
  videoUrl: string | null;
  authorId: string;
}) {
  return prisma.stepTemplate.create({
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
}

export function createTrainerStepCategoryRow(data: {
  name: string;
  description: string | null;
  icon: string | null;
  order: number;
}) {
  return prisma.stepCategory.create({
    data: {
      name: data.name,
      description: data.description,
      icon: data.icon,
      order: data.order,
    },
  });
}
