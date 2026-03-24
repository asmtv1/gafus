"use server";

import { declineRussianName } from "@gafus/core/utils";
import { createWebLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";

const logger = createWebLogger("web-get-declined-name");

const emptyDeclension = {
  nominative: "",
  genitive: "",
  dative: "",
  accusative: "",
  instrumental: "",
  prepositional: "",
};

/**
 * Возвращает все падежи имени (для автозаполнения в форме персонализации).
 * Вызывается с клиента при blur или по кнопке «Подставить склонения».
 */
export async function getDeclinedName(
  name: string,
  gender?: "male" | "female",
): Promise<{
  nominative: string;
  genitive: string;
  dative: string;
  accusative: string;
  instrumental: string;
  prepositional: string;
}> {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) {
    return emptyDeclension;
  }
  try {
    const result = declineRussianName(trimmed, gender);
    return {
      nominative: result.nominative,
      genitive: result.genitive,
      dative: result.dative,
      accusative: result.accusative,
      instrumental: result.instrumental,
      prepositional: result.prepositional,
    };
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "Ошибка склонения имени в server action",
      error instanceof Error ? error : new Error(String(error)),
    );
    return {
      nominative: trimmed,
      genitive: trimmed,
      dative: trimmed,
      accusative: trimmed,
      instrumental: trimmed,
      prepositional: trimmed,
    };
  }
}
