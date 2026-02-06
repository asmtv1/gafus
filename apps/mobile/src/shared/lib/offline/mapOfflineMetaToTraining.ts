/**
 * Маппинг OfflineCourseMeta → TrainingDaysResponse и TrainingDayResponse.
 * Статусы шагов и дней берутся из stepStore (getStepState).
 */
import type { OfflineCourseMeta } from "./offlineStorage";
import type {
  TrainingDaysResponse,
  TrainingDay,
  TrainingDayResponse,
  UserStep,
} from "@/shared/lib/api/training";
import type { LocalStepState } from "@/shared/stores/stepStore";

type GetStepState = (
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
) => LocalStepState | null;

function dayUserStatusFromSteps(
  getStepState: GetStepState,
  courseId: string,
  dayOnCourseId: string,
  stepCount: number,
): TrainingDay["userStatus"] {
  let hasInProgress = false;
  let hasPaused = false;
  let hasReset = false;
  let allCompleted = true;
  for (let i = 0; i < stepCount; i++) {
    const s = getStepState(courseId, dayOnCourseId, i);
    if (!s) {
      allCompleted = false;
      continue;
    }
    if (s.status === "COMPLETED") continue;
    allCompleted = false;
    if (s.status === "IN_PROGRESS" || s.status === "PAUSED") {
      hasInProgress = true;
      if (s.status === "PAUSED") hasPaused = true;
    }
    if (s.status === "RESET") hasReset = true;
  }
  if (allCompleted) return "COMPLETED";
  if (hasInProgress || hasPaused) return "IN_PROGRESS";
  if (hasReset) return "RESET";
  return "NOT_STARTED";
}

export function mapMetaToTrainingDaysResponse(
  meta: OfflineCourseMeta,
  getStepState: GetStepState,
): TrainingDaysResponse {
  const courseId = meta.course.id;
  const trainingDays: TrainingDay[] = meta.trainingDays.map((day) => {
    const theoryMinutes = day.steps.reduce(
      (acc, s) => (s.type === "THEORY" ? acc + ((s.estimatedDurationSec ?? 0) / 60) : acc),
      0,
    );
    const estimatedDuration = day.steps.reduce(
      (acc, s) => acc + (s.estimatedDurationSec ?? s.durationSec ?? 0),
      0,
    );
    return {
      id: day.id,
      dayOnCourseId: day.id,
      title: day.title,
      type: day.type,
      estimatedDuration: Math.round(estimatedDuration / 60) || null,
      theoryMinutes: Math.round(theoryMinutes) || null,
      equipment: day.equipment ?? null,
      order: day.order,
      userStatus: dayUserStatusFromSteps(
        getStepState,
        courseId,
        day.id,
        day.steps.length,
      ),
      completedAt: null,
    };
  });
  return {
    trainingDays,
    courseDescription: meta.course.description ?? "",
    courseId: meta.course.id,
    courseVideoUrl: meta.course.videoUrl ?? "",
    courseEquipment: meta.course.equipment ?? "",
    courseTrainingLevel: meta.course.trainingLevel ?? "",
  };
}

export function mapMetaToTrainingDayResponse(
  meta: OfflineCourseMeta,
  dayOnCourseId: string,
  getStepState: GetStepState,
): TrainingDayResponse | null {
  const day = meta.trainingDays.find((d) => d.id === dayOnCourseId);
  if (!day) return null;
  const courseId = meta.course.id;
  const steps: UserStep[] = day.steps.map((step, stepIndex) => {
    const local = getStepState(courseId, dayOnCourseId, stepIndex);
    return {
      id: step.id,
      stepId: step.id,
      stepIndex,
      status: (local?.status ?? "NOT_STARTED") as UserStep["status"],
      remainingSec: local?.remainingSec ?? null,
      completedAt: null,
      step: {
        id: step.id,
        title: step.title,
        description: step.description ?? "",
        type: (step.type as "THEORY" | "PRACTICE" | "EXAM") ?? "TRAINING",
        durationSec: step.durationSec,
        videoUrl: step.videoUrl,
        pdfUrl: step.pdfUrls?.[0] ?? null,
        order: step.order,
      },
    };
  });
  return {
    trainingDayId: day.id,
    dayOnCourseId: day.id,
    title: day.title,
    type: day.type,
    description: day.description,
    steps,
  };
}
