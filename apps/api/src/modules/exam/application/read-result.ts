/** AG1-001/LEARN032: only the existing Core exam READ; entitlement stays in Hono. */
import type { getExamResult } from "@gafus/core/services/exam";

type ExamResultReader = typeof getExamResult;

export function createReadExamResultApplication(dependencies: { readResult: ExamResultReader }) {
  return {
    execute({
      actorUserId,
      userStepId,
    }: {
      actorUserId: string;
      userStepId: string;
    }): ReturnType<ExamResultReader> {
      return dependencies.readResult(actorUserId, userStepId);
    },
  };
}
