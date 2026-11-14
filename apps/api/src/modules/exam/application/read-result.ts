import type { ExamResultData } from "@gafus/types";

type ExamResultReader = (actorUserId: string, userStepId: string) => Promise<ExamResultData | null>;

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
