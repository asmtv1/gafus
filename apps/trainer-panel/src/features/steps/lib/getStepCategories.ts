"use server";

import { getStepCategories as getStepCategoriesCore } from "@gafus/core/services/trainerStep";

import type { StepCategoryWithCount } from "@gafus/core/services/trainerStep";

export type { StepCategoryWithCount };

export async function getStepCategories(): Promise<StepCategoryWithCount[]> {
  return getStepCategoriesCore();
}
