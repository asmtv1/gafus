"use server";

import { declineRussianName } from "@gafus/core/utils";

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
    return {
      nominative: "",
      genitive: "",
      dative: "",
      accusative: "",
      instrumental: "",
      prepositional: "",
    };
  }
  const result = declineRussianName(trimmed, gender);
  return {
    nominative: result.nominative,
    genitive: result.genitive,
    dative: result.dative,
    accusative: result.accusative,
    instrumental: result.instrumental,
    prepositional: result.prepositional,
  };
}
