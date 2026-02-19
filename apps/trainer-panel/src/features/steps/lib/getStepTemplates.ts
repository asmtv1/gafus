"use server";

import {
  getStepTemplates as getStepTemplatesCore,
  getStepTemplateById as getStepTemplateByIdCore,
  searchStepTemplates as searchStepTemplatesCore,
} from "@gafus/core/services/trainerStep";

import type { StepTemplateWithCategory } from "@gafus/core/services/trainerStep";

export type { StepTemplateWithCategory };

export async function getStepTemplates(
  categoryId?: string,
): Promise<StepTemplateWithCategory[]> {
  return getStepTemplatesCore(categoryId);
}

export async function getStepTemplateById(
  id: string,
): Promise<StepTemplateWithCategory | null> {
  return getStepTemplateByIdCore(id);
}

export async function searchStepTemplates(
  query: string,
): Promise<StepTemplateWithCategory[]> {
  return searchStepTemplatesCore(query);
}
