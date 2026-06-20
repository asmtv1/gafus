type ExamRetakeState = {
  reviewedAt?: string | null;
  isPassed?: boolean | null;
} | null;

export function canRetakeRejectedExam(exam: ExamRetakeState): boolean {
  return exam?.isPassed === false;
}
