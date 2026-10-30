/** AG1-001: existing Trainer Exam summary/pending READ, with exact safe projections. */
import type { getExamResults, getPendingExamResults } from "@gafus/core/services/exam";

type ExamResultsReader = typeof getExamResults;
type PendingExamResultsReader = typeof getPendingExamResults;


function invalidSource(): never {
  throw new Error("TRAINER_EXAM_SUMMARY_SOURCE_INVALID");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalidSource();
  return value as Record<string, unknown>;
}
function stringValue(value: unknown, required = false): string {
  if (typeof value !== "string" || (required && !value)) return invalidSource();
  return value;
}
function boolValue(value: unknown): boolean {
  if (typeof value !== "boolean") return invalidSource();
  return value;
}
function summaryRows(raw: unknown) {
  if (!Array.isArray(raw)) return invalidSource();
  return raw.map((candidate: unknown) => {
    const result = record(candidate);
    const date = result.createdAt;
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
      return invalidSource();
    }
    const step = record(record(result.userStep).stepOnDay);
    const training = record(record(result.userStep).userTraining);
    const dayOnCourse = record(training.dayOnCourse);
    const status = stringValue(record(result.userStep).status);
    if (status !== "IN_PROGRESS" && status !== "COMPLETED") {
      return invalidSource();
    }
    const sourceStep = record(step.step);
    const normalizedStatus: "IN_PROGRESS" | "COMPLETED" =
      status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS";
    return {
      id: stringValue(result.id, true),
      createdAt: date.toISOString(),
      courseName: stringValue(record(dayOnCourse.course).name),
      stepTitle: stringValue(sourceStep.title),
      status: normalizedStatus,
      hasTestQuestions: boolValue(sourceStep.hasTestQuestions),
      requiresWrittenFeedback: boolValue(sourceStep.requiresWrittenFeedback),
      requiresVideoReport: boolValue(sourceStep.requiresVideoReport),
    };
  }).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id, "en"));
}

function pendingRows(source: unknown) {
  if (!Array.isArray(source)) return invalidSource();
  return source.map((raw: unknown) => {
    const row = record(raw);
    const timestamp = row.submittedAt;
    if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) {
      return invalidSource();
    }
    return {
      id: stringValue(row.id, true),
      stepTitle: stringValue(row.stepTitle),
      courseName: stringValue(row.courseName),
      dayTitle: stringValue(row.dayTitle),
      hasTestQuestions: boolValue(row.hasTestQuestions),
      hasWrittenFeedback: boolValue(row.hasWrittenFeedback),
      hasVideoReport: boolValue(row.hasVideoReport),
      submittedAt: timestamp.toISOString(),
    };
  }).sort((a, b) =>
    b.submittedAt.localeCompare(a.submittedAt) || a.id.localeCompare(b.id, "en"));
}

export function createReadTrainerExamMetadataApplication(dependencies: {
  examResults: ExamResultsReader;
  pendingExamResults: PendingExamResultsReader;
}) {
  return {
    async summary({ actorUserId, isAdmin }: { actorUserId: string; isAdmin: boolean }) {
      const source = await dependencies.examResults(actorUserId, { hideCompleted: false }, isAdmin);
      return summaryRows(source);
    },
    async pendingSummary({ actorUserId, isAdmin }: { actorUserId: string; isAdmin: boolean }) {
      const source = await dependencies.pendingExamResults(actorUserId, isAdmin);
      return pendingRows(source);
    },
  };
}
