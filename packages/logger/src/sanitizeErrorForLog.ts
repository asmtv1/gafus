import type { LogMeta } from "./logger-types.js";

/**
 * Zod кладёт в issues поле `received` (в т.ч. полный текст clientProblem) — не логировать в сыром виде.
 */
export function isZodErrorLike(
  err: unknown,
): err is { issues: Array<{ path: PropertyKey[]; code: string; message: string }> } {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: string }).name === "ZodError" &&
    Array.isArray((err as { issues?: unknown }).issues)
  );
}

export function sanitizeZodErrorForLogMeta(
  err: { issues: Array<{ path: PropertyKey[]; code: string; message: string }> },
): LogMeta {
  return {
    errorName: "ZodError",
    issueCount: err.issues.length,
    zodIssues: err.issues.map((i) => ({
      path: i.path.length > 0 ? i.path.map(String).join(".") : "(root)",
      code: i.code,
      message: i.message,
    })),
  };
}
