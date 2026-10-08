import { ZodError } from "zod";
import { createWebLogger } from "@gafus/logger";
const logger = createWebLogger("questions");
export class QuestionError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function questionHttpError(error: unknown) {
  if (error instanceof QuestionError)
    return {
      status: error.status,
      body: { success: false, error: error.message, code: error.code },
    };
  if (error instanceof ZodError)
    return {
      status: 400,
      body: {
        success: false,
        error: error.issues[0]?.message ?? "Проверьте введённые данные",
        code: "VALIDATION_ERROR",
      },
    };
  if (error instanceof SyntaxError)
    return {
      status: 400,
      body: { success: false, error: "Некорректный запрос", code: "INVALID_REQUEST" },
    };
  logger.error(
    "Questions request failed",
    error instanceof Error ? error : new Error(String(error)),
  );
  return {
    status: 500,
    body: {
      success: false,
      error: "Не удалось выполнить запрос. Попробуйте ещё раз",
      code: "QUESTIONS_UNAVAILABLE",
    },
  };
}
