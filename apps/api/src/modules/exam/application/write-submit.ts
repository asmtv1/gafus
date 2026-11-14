import type { ExamSubmissionData } from "@gafus/types";

type SubmitExamResult = (
  actorUserId: string,
  data: ExamSubmissionData,
) => Promise<{ success: boolean; examResultId: string }>;

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
