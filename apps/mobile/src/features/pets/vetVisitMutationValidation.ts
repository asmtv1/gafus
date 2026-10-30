/** Narrow AG1 precommit-only typed 400 acknowledgement. No medical contents. */
import type { ApiResponse } from "@/shared/lib/api/client";
export const vetFieldNames = [
  "body",
  "visitedOn",
  "specialty",
  "doctorName",
  "clinic",
  "diagnosis",
  "conclusion",
  "notes",
] as const;
export type VetFieldName = (typeof vetFieldNames)[number];
export type VetFieldCode =
  | "INVALID_JSON"
  | "INVALID_TYPE"
  | "REQUIRED"
  | "OUT_OF_RANGE"
  | "INVALID_VALUE";
export type VetFieldErrors = Partial<Record<VetFieldName, VetFieldCode>>;
const codes = [
  "INVALID_JSON",
  "INVALID_TYPE",
  "REQUIRED",
  "OUT_OF_RANGE",
  "INVALID_VALUE",
] as const;
export function vetPrecommitRejection(response: ApiResponse<unknown>): VetFieldErrors | null {
  if (
    response.success ||
    !["VET_VISIT_INVALID_JSON", "VET_VISIT_VALIDATION_ERROR"].includes(response.code ?? "")
  )
    return null;
  const details = response.details;
  const raw = details?.fieldErrors;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const sanitized: VetFieldErrors = {};
  for (const [key, value] of Object.entries(raw)) {
    if (
      !vetFieldNames.includes(key as VetFieldName) ||
      typeof value !== "string" ||
      !codes.includes(value as VetFieldCode)
    )
      return null;
    sanitized[key as VetFieldName] = value as VetFieldCode;
  }
  if (!Object.keys(sanitized).length) return null;
  if (
    response.code === "VET_VISIT_INVALID_JSON" &&
    (Object.keys(sanitized).length !== 1 || sanitized.body !== "INVALID_JSON")
  )
    return null;
  return sanitized;
}
export function vetFieldErrorMessage(errors: VetFieldErrors): string {
  if (errors.body === "INVALID_JSON") return "Не удалось прочитать запись. Проверьте данные формы.";
  if (errors.visitedOn) return "Проверьте дату посещения.";
  if (errors.specialty) return "Проверьте специальность врача.";
  if (errors.doctorName || errors.clinic || errors.diagnosis || errors.conclusion || errors.notes)
    return "Проверьте длину и формат полей записи.";
  return "Проверьте поля записи.";
}
