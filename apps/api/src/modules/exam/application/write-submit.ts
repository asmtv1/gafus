/** AG1-001/LEARN032: existing Core exam submit, entitlement remains in Hono. */
import type { submitExamResult } from "@gafus/core/services/exam";

type SubmitExamResult = typeof submitExamResult;

export function createWriteExamSubmitApplication(dependencies: { submit: SubmitExamResult }) {
  return {
    execute({
      actorUserId,
      data,
    }: {
      actorUserId: Parameters<SubmitExamResult>[0];
      data: Parameters<SubmitExamResult>[1];
    }): ReturnType<SubmitExamResult> {
      return dependencies.submit(actorUserId, data);
    },
  };
}
