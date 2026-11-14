/** Course survey database ownership boundary.
 * Core validates templates, answers and course entitlement; this adapter
 * preserves the exact user/course/day/physical-step predicates and the
 * single-row per-training serialization across response and step mutations.
 */
import { prisma, type Prisma, type SurveyResponse, type TrainingStatus } from "@gafus/prisma";

export type SurveyResponseRow = SurveyResponse;

export function readSurveyResponseRow(userId: string, stepId: string) {
  return prisma.surveyResponse.findUnique({
    where: { userId_stepId: { userId, stepId } },
  });
}

export function readSurveyComparisonRows(userId: string, courseId: string, familySlug: string) {
  return prisma.surveyResponse.findMany({
    where: { userId, courseId, surveyFamilySlug: familySlug },
    orderBy: { submittedAt: "asc" },
  });
}

export function readSurveyStepRow(stepId: string) {
  return prisma.step.findFirst({
    where: { id: stepId },
    select: { id: true, type: true, surveySlug: true },
  });
}

/** The user step is not sufficient by itself: it must be in this owner's
 * training for this course, with a physical step belonging to that day's
 * exact occurrence rather than another reuse of the same Step. */
export function readOwnedSurveyUserStepRow(userId: string, courseId: string, userStepId: string) {
  return prisma.userStep.findFirst({
    where: {
      id: userStepId,
      userTraining: { userId, dayOnCourse: { courseId } },
    },
    select: {
      id: true,
      userTrainingId: true,
      stepOnDay: { select: { stepId: true, dayId: true } },
      userTraining: { select: { dayOnCourse: { select: { dayId: true } } } },
    },
  });
}

export interface SurveySubmissionRowsInput {
  userId: string;
  courseId: string;
  stepId: string;
  userStepId: string;
  userTrainingId: string;
  petId?: string | null;
  surveySlug: string;
  surveyFamilySlug: string;
  phase: "INITIAL" | "FINAL";
  surveyVersion: number;
  answers: Record<string, string | string[] | boolean | null>;
}

export async function writeSurveyResponseRows(
  input: SurveySubmissionRowsInput,
  canEdit: (submittedAt: Date) => boolean,
  calculateStatus: (statuses: TrainingStatus[]) => TrainingStatus,
): Promise<{ kind: "expired" | "saved"; response: SurveyResponseRow }> {
  if (!input.userId || !input.courseId || !input.stepId || !input.userStepId ||
      !input.userTrainingId) throw new Error("SURVEY_ROW_SCOPE_REQUIRED");
  return prisma.$transaction(async tx => {
    // Cross-request serialization *before* checking edit deadline/create race.
    const parent = await tx.$queryRaw<{ id: string }[]>`
      SELECT t."id" FROM public."UserTraining" t
      JOIN public."DayOnCourse" d ON d."id" = t."dayOnCourseId"
      JOIN public."UserStep" us ON us."userTrainingId" = t."id"
      JOIN public."StepOnDay" sod ON sod."id" = us."stepOnDayId"
      WHERE t."id" = ${input.userTrainingId}
        AND t."userId" = ${input.userId}
        AND d."courseId" = ${input.courseId}
        AND us."id" = ${input.userStepId}
        AND sod."stepId" = ${input.stepId}
        AND sod."dayId" = d."dayId"
      FOR UPDATE OF t
    `;
    if (parent.length !== 1) throw new Error("USER_TRAINING_NOT_FOUND");

    const existing = await tx.surveyResponse.findUnique({
      where: { userId_stepId: { userId: input.userId, stepId: input.stepId } },
    });
    if (existing && !canEdit(existing.submittedAt)) return { kind: "expired", response: existing };

    const saved = existing
      ? await tx.surveyResponse.update({
          where: { id: existing.id },
          data: { answers: input.answers as Prisma.InputJsonValue, petId: input.petId ?? null },
        })
      : await tx.surveyResponse.create({
          data: {
            userId: input.userId,
            courseId: input.courseId,
            stepId: input.stepId,
            petId: input.petId ?? null,
            surveySlug: input.surveySlug,
            surveyFamilySlug: input.surveyFamilySlug,
            phase: input.phase,
            surveyVersion: input.surveyVersion,
            answers: input.answers as Prisma.InputJsonValue,
            submittedAt: new Date(),
          },
        });

    await tx.userStep.update({
      where: { id: input.userStepId }, data: { status: "COMPLETED" },
    });
    // Includes our own uncommitted completion; never query another client.
    const userSteps = await tx.userStep.findMany({
      where: { userTrainingId: input.userTrainingId }, select: { status: true },
    });
    const statuses = userSteps.map(row => row.status);
    const nextStatus = statuses.length ? calculateStatus(statuses) : "COMPLETED";
    await tx.userTraining.update({
      where: { id: input.userTrainingId }, data: { status: nextStatus },
    });
    return { kind: "saved", response: saved };
  });
}
