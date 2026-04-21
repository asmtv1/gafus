import {
  ConsultationForbiddenError,
  ConsultationNotFoundError,
  ConsultationSlotTakenError,
  TelemostUnavailableError,
} from "@gafus/core";
import type { Logger } from "@gafus/logger";
import { isZodErrorLike, sanitizeZodErrorForLogMeta } from "@gafus/logger";
import { z } from "zod";

/** Без полного Zod issues.received (PII вроде clientProblem). */
export function logConsultationRouteError(logger: Logger, label: string, error: unknown): void {
  if (isZodErrorLike(error)) {
    logger.error(label, undefined, sanitizeZodErrorForLogMeta(error));
    return;
  }
  if (error instanceof Error) {
    logger.error(label, error);
    return;
  }
  logger.error(label, new Error(String(error)));
}

export function mapConsultationError(
  error: unknown,
): { status: number; body: Record<string, unknown> } | null {
  if (error instanceof ConsultationSlotTakenError) {
    return { status: 409, body: { success: false, error: error.message, code: error.code } };
  }
  if (error instanceof ConsultationForbiddenError) {
    return { status: 403, body: { success: false, error: error.message, code: error.code } };
  }
  if (error instanceof ConsultationNotFoundError) {
    return { status: 404, body: { success: false, error: error.message, code: error.code } };
  }
  if (error instanceof TelemostUnavailableError) {
    return { status: 503, body: { success: false, error: error.message, code: error.code } };
  }
  return null;
}

export function mapZodError(error: unknown): { status: number; body: Record<string, unknown> } | null {
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      body: {
        success: false,
        error: error.errors[0]?.message ?? "Ошибка валидации",
        code: "VALIDATION_ERROR",
      },
    };
  }
  return null;
}
