/** AG1-001/TR013: existing public templates READ, unchanged metadata projection. */
import type { getStepTemplates } from "@gafus/core/services/trainerStep";

type TemplatesReader = typeof getStepTemplates;

type Row = Record<string, unknown>;
import type { TrainerPublicStepTemplateItem } from
  "../../../../../../packages/types/src/data/trainer-read-contracts";

function badCore(): never {
  // Fixed internal signal, not a stored Prisma record, actor, or provider error.
  throw new Error("TR013_INVALID_CORE_PUBLIC_TEMPLATE");
}
function record(input: unknown): Row {
  if (!input || typeof input !== "object" || Array.isArray(input)) return badCore();
  return input as Row;
}
function list(input: unknown): unknown[] {
  if (!Array.isArray(input)) return badCore();
  return input;
}
function string(input: unknown, required = false): string {
  if (typeof input !== "string" || (required && input.length === 0)) return badCore();
  return input;
}
function nullableString(input: unknown): string | null {
  return input === null ? null : string(input);
}
function strings(input: unknown): string[] {
  return list(input).map(x => string(x));
}
function flag(input: unknown): boolean {
  if (typeof input !== "boolean") return badCore();
  return input;
}
function nullableNumber(input: unknown): number | null {
  if (input === null) return null;
  if (typeof input !== "number" || !Number.isFinite(input)) return badCore();
  return input;
}
function count(input: unknown): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 0)
    return badCore();
  return input;
}
function iso(input: unknown): string {
  if (!(input instanceof Date) || !Number.isFinite(input.getTime()))
    return badCore();
  return input.toISOString();
}

/** Strict projection; the Core Prisma spread contains additional private scalars. */
function project(input: unknown): TrainerPublicStepTemplateItem {
  const template = record(input);
  const author = record(template.author);
  const category = template.category === null ? null : record(template.category);
  if (template.isPublic !== true || template.checklist === undefined)
    return badCore();
  return {
    id: string(template.id, true),
    title: string(template.title),
    description: string(template.description),
    durationSec: nullableNumber(template.durationSec),
    type: string(template.type),
    imageUrls: strings(template.imageUrls),
    pdfUrls: strings(template.pdfUrls),
    videoUrl: nullableString(template.videoUrl),
    checklist: template.checklist,
    requiresVideoReport: flag(template.requiresVideoReport),
    requiresWrittenFeedback: flag(template.requiresWrittenFeedback),
    hasTestQuestions: flag(template.hasTestQuestions),
    surveySlug: nullableString(template.surveySlug),
    tags: strings(template.tags),
    isPublic: true,
    usageCount: count(template.usageCount),
    category: category ? {
      id: string(category.id, true),
      name: string(category.name),
      icon: nullableString(category.icon),
    } : null,
    author: {
      id: string(author.id, true),
      username: string(author.username),
    },
    createdAt: iso(template.createdAt),
  };
}

export function createReadPublicTemplatesApplication(dependencies: {
  readTemplates: TemplatesReader;
}) {
  return {
    async execute({ categoryId }: {
      categoryId: string | undefined;
    }): Promise<TrainerPublicStepTemplateItem[]> {
      const stored: unknown = await dependencies.readTemplates(categoryId);
      const data = list(stored).map(project);
      if (categoryId && data.some(item => item.category?.id !== categoryId))
        return badCore();
      for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1]!;
        const next = data[i]!;
        if (prev.usageCount < next.usageCount ||
            (prev.usageCount === next.usageCount &&
             Date.parse(prev.createdAt) < Date.parse(next.createdAt)))
          return badCore();
      }
      return data;
    },
  };
}
