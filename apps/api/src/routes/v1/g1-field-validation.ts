/** Stable owner-edit field codes. Never echo untrusted submitted values. */
import type { z } from "zod";
import type { Context } from "hono";
type ValidationResult = { success: boolean; error?: z.ZodError };
export type OwnerEditValidationCode = "PET_VALIDATION_ERROR" | "PROFILE_VALIDATION_ERROR";
export function ownerEditValidationError(
  result: ValidationResult, c: Context, code: OwnerEditValidationCode,
) {
  if (result.success || !result.error) return;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = issue.path.map(String).join(".") || "body";
    if (field in fieldErrors) continue;
    if (issue.message === "UNSUPPORTED_FIELD") fieldErrors[field] = "UNSUPPORTED_FIELD";
    else if (issue.code === "invalid_type") {
      fieldErrors[field] = issue.received === "null" ? "NOT_NULLABLE" : "INVALID_TYPE";
    } else if (issue.code === "too_small") {
      fieldErrors[field] = issue.type === "string" ? "REQUIRED" : "OUT_OF_RANGE";
    } else if (issue.code === "too_big") fieldErrors[field] = "OUT_OF_RANGE";
    else fieldErrors[field] = "INVALID_VALUE";
  }
  return c.json({ success: false, code, error: "Некорректные поля", fieldErrors },
    400, { "Cache-Control": "private, no-store" });
}
export const petEditValidationError = (result: ValidationResult, c: Context) =>
  ownerEditValidationError(result, c, "PET_VALIDATION_ERROR");
export const profileEditValidationError = (result: ValidationResult, c: Context) =>
  ownerEditValidationError(result, c, "PROFILE_VALIDATION_ERROR");
