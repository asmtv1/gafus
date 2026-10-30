/** AG1-002: erased-only exact whole GET /daily-course/day JSON producer. */
import type { JSONParsed } from "hono/utils/types";
import type { DailyCourseDayResponse, DailyCourseStepDto } from "@gafus/core/services/dailyCourse";
import type { TrainingStatus } from "../../../../../packages/types/src/utils/training-status";
import type {
  DailyCourseDayWire,
  DailyCourseDayStepWire,
  DailyCourseDayRead,
  DailyCourseBoundDayWire,
  DailyCourseBoundStepWire,
} from "../../../../../packages/types/src/data/training";
import type { createDayAndStepCommandsApplication } from "../../modules/learner-daily/application/day-and-step-commands";

type Same<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;
type Assert<T extends true> = T;
type Not<T extends boolean> = T extends false ? true : false;
type ExactShape<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? Same<keyof A, keyof B>
    : false
  : false;
type ApplicationDay = Awaited<
  ReturnType<ReturnType<typeof createDayAndStepCommandsApplication>["getDay"]>
>;
type Found = NonNullable<ApplicationDay>;

export type ProducerIsActualCoreDay = Assert<ExactShape<Found, DailyCourseDayResponse>>;
// The new opt-in response contains the stable occurrence key; the legacy
// projection explicitly strips that key and preserves the old exact wire.
type LegacyStep = Omit<DailyCourseStepDto, "bundleStepId" | "timerSnapshot">;
type LegacyDay = Omit<Found, "steps" | "serverNow"> & { steps: LegacyStep[] };
export type WholeDayMatchesHonoJson = Assert<ExactShape<JSONParsed<LegacyDay>, DailyCourseDayWire>>;
export type AllStepsMatchHonoJson = Assert<
  ExactShape<JSONParsed<LegacyStep>, DailyCourseDayStepWire>
>;
export type BoundDayMatchesHonoJson = Assert<
  ExactShape<
    JSONParsed<Found & { onlineStepBinding: "BUNDLE_STEP_ID_V1" }>,
    DailyCourseBoundDayWire
  >
>;
export type BoundStepMatchesHonoJson = Assert<
  ExactShape<JSONParsed<DailyCourseStepDto>, DailyCourseBoundStepWire>
>;
export type NestedStepMatchesJson = Assert<
  ExactShape<JSONParsed<DailyCourseStepDto["step"]>, DailyCourseDayStepWire["step"]>
>;
export type SuccessEnvelopeNonNull = Assert<
  Same<DailyCourseDayRead, { success: true; data: DailyCourseDayWire }>
>;
export type OriginalCoreNoActualDateOnWire = Assert<
  Same<DailyCourseDayStepWire["completedAt"], string | null>
>;
export type HonoDateConvertsToIso = Assert<Same<JSONParsed<Date>, string>>;
export type JsonTimerNullable = Assert<Same<DailyCourseDayStepWire["remainingSec"], number | null>>;
export type ServerRemainingOptional = Assert<
  Same<DailyCourseDayStepWire["remainingSecOnServer"], number | undefined>
>;
export type ChecklistNullableAndExact = Assert<
  Same<
    DailyCourseDayStepWire["step"]["checklist"],
    JSONParsed<DailyCourseStepDto["step"]["checklist"]>
  >
>;
export type StatusPreservesCoreTrainingEnum = Assert<
  Same<DailyCourseDayWire["userStatus"], TrainingStatus>
>;
export type RejectInventedOwnerEmail = Assert<
  Not<"ownerEmail" extends keyof DailyCourseDayWire ? true : false>
>;
export type RejectInventedMediaTransformation = Assert<
  Not<"processedVideoUrl" extends keyof DailyCourseDayStepWire["step"] ? true : false>
>;
export type RejectSuccessNull = Assert<Not<null extends DailyCourseDayRead["data"] ? true : false>>;
export type RejectDateAtAlreadySerializedStep = Assert<
  Not<Date extends DailyCourseDayStepWire["completedAt"] ? true : false>
>;
export type RejectStatusStringLiteralChange = Assert<
  Not<"RANDOM_STATUS" extends DailyCourseDayStepWire["status"] ? true : false>
>;
export type RejectNonnumericStepIndex = Assert<
  Not<string extends DailyCourseDayStepWire["stepIndex"] ? true : false>
>;

// This DailyCourse Core response has no monetized locked/hidden step variant;
// do not borrow an ordinary TrainingDayWire redaction field.
export type RejectInventedLockedStep = Assert<
  Not<"locked" extends keyof DailyCourseDayStepWire ? true : false>
>;
export type RejectInventedRedactionKey = Assert<
  Not<"monetizationTarget" extends keyof DailyCourseDayStepWire ? true : false>
>;
export type RejectInventedRawStepUpdatedAt = Assert<
  Not<"updatedAt" extends keyof DailyCourseDayStepWire ? true : false>
>;
