"use server";

import {
  getStepTemplates as getStepTemplatesCore,
  getStepTemplateById as getStepTemplateByIdCore,
  searchStepTemplates as searchStepTemplatesCore,
} from "@gafus/core/services/trainerStep";
import { createTrainerPanelLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";

import type { StepTemplateWithCategory } from "@gafus/core/services/trainerStep";

export type { StepTemplateWithCategory };

const logger = createTrainerPanelLogger("trainer-get-step-templates");

export async function getStepTemplates(
  categoryId?: string,
): Promise<StepTemplateWithCategory[]> {
  try {
    return await getStepTemplatesCore(categoryId);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "getStepTemplates failed",
      error instanceof Error ? error : new Error(String(error)),
      { categoryId: categoryId ?? "" },
    );
    throw error;
  }
}

export async function getStepTemplateById(
  id: string,
): Promise<StepTemplateWithCategory | null> {
  try {
    return await getStepTemplateByIdCore(id);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "getStepTemplateById failed",
      error instanceof Error ? error : new Error(String(error)),
      { id },
    );
    throw error;
  }
}

export async function searchStepTemplates(
  query: string,
): Promise<StepTemplateWithCategory[]> {
  try {
    return await searchStepTemplatesCore(query);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "searchStepTemplates failed",
      error instanceof Error ? error : new Error(String(error)),
      { queryLen: query.length },
    );
    throw error;
  }
}
