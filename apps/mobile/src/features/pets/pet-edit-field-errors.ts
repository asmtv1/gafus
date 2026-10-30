import type { PetFormErrors } from "./pet-form-validation";
import type { ApiResponse } from "@/shared/lib/api/client";
const fieldNames = [
  "name",
  "breed",
  "birthDate",
  "heightCm",
  "neckGirthCm",
  "muzzleGirthCm",
  "bellyGirthCm",
  "weightKg",
] as const;
type PetValidationCode =
  | "INVALID_TYPE"
  | "NOT_NULLABLE"
  | "OUT_OF_RANGE"
  | "REQUIRED"
  | "UNSUPPORTED_FIELD"
  | "INVALID_VALUE";
const messages: Record<PetValidationCode, string> = {
  INVALID_TYPE: "Некорректный тип значения",
  NOT_NULLABLE: "Это поле нельзя очистить",
  OUT_OF_RANGE: "Значение выходит за допустимые пределы",
  REQUIRED: "Обязательное поле",
  UNSUPPORTED_FIELD: "Изменение этого поля недоступно",
  INVALID_VALUE: "Недопустимое значение",
};
export function petEditServerErrors(
  response: Pick<ApiResponse<unknown>, "code" | "details">,
): PetFormErrors {
  if (response.code !== "PET_VALIDATION_ERROR") return {};
  const values = response.details?.fieldErrors;
  if (!values || typeof values !== "object" || Array.isArray(values)) return {};
  const found: PetFormErrors = {};
  for (const field of fieldNames) {
    const value = (values as Record<string, unknown>)[field];
    if (typeof value === "string" && Object.prototype.hasOwnProperty.call(messages, value))
      found[field] = messages[value as PetValidationCode];
  }
  return found;
}
