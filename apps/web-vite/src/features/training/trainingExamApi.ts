import type { ExamResultWire } from "@gafus/types";
import type { TrainingDaySummary } from "./trainingDaysApi";
import type { TrainingStepPreview } from "./trainingDayApi";
import { ApiError, apiRequest } from "../../shared/api/client";

export type LearnerExamQuestion = {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
};
export type LearnerExam = {
  userStepId: string;
  stepId: string;
  questions: LearnerExamQuestion[];
  requiresWrittenFeedback: boolean;
  requiresVideoReport: boolean;
};
export type LearnerExamPreview = Omit<LearnerExam, "userStepId"> & {
  userStepId: string | null;
};
type RecordValue = Record<string, unknown>;
const record = (v: unknown): v is RecordValue =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const cuid = (v: unknown): v is string =>
  typeof v === "string" && /^c[a-z0-9]{24}$/.test(v);
const stepId = (v: unknown): v is string => cuid(v) ||
  (typeof v === "string" && /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(v));

/** Explicit user gesture only. The registered Hono GET createIfMissing=true
 * initializes missing UserTraining/UserStep rows; the normal viewer must
 * keep createIfMissing=false. This never synthesizes a UserStep ID.
 */
async function readLearnerExamBinding(
  courseType: string, day: TrainingDaySummary,
  step: Pick<TrainingStepPreview, "id" | "order" | "type" | "locked">,
  createIfMissing: boolean,
): Promise<LearnerExamPreview> {
  if (!id(courseType) || !id(day.courseId) || !id(day.dayOnCourseId) ||
      day.isLocked || step.locked || step.type !== "EXAMINATION" || !id(step.id) ||
      !Number.isSafeInteger(step.order) || step.order < 0) {
    throw Error("INVALID_EXAM_ACCESS");
  }
  const qs = new URLSearchParams({
    courseType, dayOnCourseId: day.dayOnCourseId,
    createIfMissing: createIfMissing ? "true" : "false",
  });
  const data = await apiRequest<unknown>("/api/v1/training/day?" + qs, {
    method: "GET", browserAuth: true,
  });
  if (!record(data) || data.courseId !== day.courseId ||
      data.dayOnCourseId !== day.dayOnCourseId || !Array.isArray(data.steps)) {
    throw Error("EXAM_IDENTITY_MISMATCH");
  }
  // Both template ID and physical occurrence order must match; duplicated
  // templates in a day cannot accidentally bind another user step.
  const matches = data.steps.filter(item => record(item) &&
    item.id === step.id && item.order === step.order &&
    item.type === "EXAMINATION" && item.locked === false);
  if (matches.length !== 1 || !record(matches[0])) throw Error("EXAM_STEP_MISMATCH");
  const raw = matches[0];
  if (!stepId(raw.id) ||
      (raw.userStepId != null && !cuid(raw.userStepId)) ||
      (createIfMissing && !cuid(raw.userStepId)) ||
      (raw.requiresWrittenFeedback != null && typeof raw.requiresWrittenFeedback !== "boolean") ||
      (raw.requiresVideoReport != null && typeof raw.requiresVideoReport !== "boolean") ||
      (raw.hasTestQuestions != null && typeof raw.hasTestQuestions !== "boolean")) {
    throw Error("EXAM_BINDING_UNAVAILABLE");
  }
  const questions: LearnerExamQuestion[] = [];
  if (raw.hasTestQuestions) {
    if (!Array.isArray(raw.checklist) || raw.checklist.length < 1 ||
        raw.checklist.length > 100) throw Error("EXAM_QUESTIONS_INVALID");
    const used = new Set<string>();
    for (const value of raw.checklist) {
      if (!record(value) || !id(value.id) || used.has(value.id as string) ||
          typeof value.question !== "string" || !value.question.trim() ||
          !Array.isArray(value.options) || value.options.length < 2 ||
          value.options.length > 20 || value.options.some(option =>
            typeof option !== "string" || !option.trim()) ||
          !Number.isSafeInteger(value.correctAnswer) ||
          Number(value.correctAnswer) < 0 ||
          Number(value.correctAnswer) >= value.options.length) {
        throw Error("EXAM_QUESTIONS_INVALID");
      }
      used.add(value.id as string);
      questions.push({
        id: value.id as string, question: value.question as string,
        options: value.options as string[],
        correctAnswer: value.correctAnswer as number,
      });
    }
  }
  return {
    userStepId: cuid(raw.userStepId) ? raw.userStepId : null, stepId: raw.id, questions,
    requiresWrittenFeedback: raw.requiresWrittenFeedback === true,
    requiresVideoReport: raw.requiresVideoReport === true,
  };
}

/** Pure authenticated GET: renders original Next examination questions
 * on accordion expansion, without creating UserStep, making a wallet mutation,
 * or relying on guessed occurrence identifiers. */
export async function readLearnerExamPreview(
  courseType: string, day: TrainingDaySummary,
  step: Pick<TrainingStepPreview, "id" | "order" | "type" | "locked">,
): Promise<LearnerExamPreview> {
  return readLearnerExamBinding(courseType, day, step, false);
}

/** Side-effectful creation happens ONLY after an explicit user action. */
export async function initializeLearnerExam(
  courseType: string, day: TrainingDaySummary,
  step: Pick<TrainingStepPreview, "id" | "order" | "type" | "locked">,
  createIfMissing = true,
): Promise<LearnerExam> {
  const candidate = await readLearnerExamBinding(courseType, day, step, createIfMissing);
  if (!candidate.userStepId) throw Error("EXAM_BINDING_UNAVAILABLE");
  return { ...candidate, userStepId: candidate.userStepId };
}

/** 404 is the only valid "not attempted yet" response. 401/402/403 and
 * malformed successful JSON stay errors and never become a fake empty exam.
 */
export async function readLearnerExam(userStepId: string): Promise<ExamResultWire | null> {
  if (!cuid(userStepId)) throw Error("INVALID_USER_STEP_ID");
  let result: unknown;
  try {
    result = await apiRequest<unknown>(
      "/api/v1/exam/result?userStepId=" + userStepId,
      { method: "GET", browserAuth: true },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
  if (!record(result) || !id(result.id) ||
      (result.testAnswers !== null && !record(result.testAnswers)) ||
      (result.writtenFeedback !== null && typeof result.writtenFeedback !== "string") ||
      (result.isPassed !== null && typeof result.isPassed !== "boolean") ||
      (result.trainerComment !== null && typeof result.trainerComment !== "string")) {
    throw Error("INVALID_EXAM_RESULT");
  }
  return result as unknown as ExamResultWire;
}

export async function submitLearnerExam(input: {
  userStepId: string; stepId: string;
  testAnswers?: Record<string, number>;
  writtenFeedback?: string;
  videoReportUrl?: string;
}): Promise<void> {
  if (!cuid(input.userStepId) || !stepId(input.stepId) ||
      (input.testAnswers === undefined && input.writtenFeedback === undefined &&
        input.videoReportUrl === undefined) ||
      (input.videoReportUrl !== undefined &&
        (!/^https:\/\//.test(input.videoReportUrl) || input.videoReportUrl.length > 4096)) ||
      (input.writtenFeedback !== undefined &&
        (input.writtenFeedback.trim().length < 10 || input.writtenFeedback.length > 10000))) {
    throw Error("INVALID_EXAM_SUBMISSION");
  }
  await apiRequest<unknown>("/api/v1/exam/submit", {
    method: "POST", browserAuth: true,
    json: {
      userStepId: input.userStepId, stepId: input.stepId,
      ...(input.testAnswers === undefined ? {} : { testAnswers: input.testAnswers }),
      ...(input.writtenFeedback === undefined ? {} :
        { writtenFeedback: input.writtenFeedback.trim() }),
      ...(input.videoReportUrl === undefined ? {} : { videoReportUrl: input.videoReportUrl }),
    },
  });
}

/** Multipart is intentionally not handled by the JSON-only shared client.
 * Hono validates ownership, file type, and the same 100 MiB server cap.
 */
export async function uploadLearnerExamVideo(
  userStepId: string, file: File,
): Promise<string> {
  if (!cuid(userStepId) || !file.type.startsWith("video/") ||
      file.size < 1 || file.size > 100 * 1024 * 1024) {
    throw Error("INVALID_EXAM_VIDEO");
  }
  const data = new FormData();
  data.set("userStepId", userStepId);
  data.set("video", file);
  const response = await fetch("/api/v1/exam/upload-video", {
    method: "POST", credentials: "include", cache: "no-store",
    headers: { Accept: "application/json", "X-Gafus-Auth-Transport": "cookie" },
    body: data,
  });
  if (!response.ok) throw new ApiError(response.status, "Не удалось отправить видео");
  const result: unknown = await response.json().catch(() => null);
  if (!record(result) || result.success !== true || !record(result.data) ||
      typeof result.data.videoUrl !== "string" ||
      !/^https:\/\//.test(result.data.videoUrl) || result.data.videoUrl.length > 4096) {
    throw Error("INVALID_EXAM_VIDEO_ACK");
  }
  return result.data.videoUrl;
}
