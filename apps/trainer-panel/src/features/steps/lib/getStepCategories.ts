"use server";

import {
  getStepCategories as getStepCategoriesCore,
  type StepCategoryWithCount,
} from "@gafus/core/services/trainerStep";
import { createTrainerPanelLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";

export type { StepCategoryWithCount };

const logger = createTrainerPanelLogger("trainer-get-step-categories");

export async function getStepCategories(): Promise<StepCategoryWithCount[]> {
  try {
    return await getStepCategoriesCore();
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "getStepCategories failed",
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}
