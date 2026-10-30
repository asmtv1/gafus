/** AG1-002: type-only full Core TrainingDetail -> Hono JSON wire conformance. */
import type { JSONParsed } from "hono/utils/types";
import type { TrainingDetail, TrainingStep } from "@gafus/types";
import type { TrainingStatus } from "../../../../../packages/types/src/utils/training-status";
import type {
  TrainingDayRead,
  TrainingDayStepWire,
  TrainingDayWire,
} from "../../../../../packages/types/src/data/training";
import type { ReadTrainingDayResult } from "../../modules/training/application/read-training-day";

type Same<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;
type Assert<T extends true> = T;
type Not<T extends boolean> = T extends false ? true : false;
type Found = Extract<ReadTrainingDayResult, { kind: "found" }>["detail"];

export type ProducerDomainIsFullDetail = Assert<Same<Found, TrainingDetail>>;
// Hono JSONParsed is mapped, while the canonical API wire is an interface.
// Assert mutual assignability AND precise field-key identity at both levels.
// This avoids mistaking TS's nominal mapped/interface `Same` behavior for a
// DTO mismatch while still rejecting missing or extra fields.
type ExactShape<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? Same<keyof A, keyof B>
    : false
  : false;
export type JsonWireMatchesCore = Assert<ExactShape<JSONParsed<Found>, TrainingDayWire>>;
export type JsonStepMatchesCore = Assert<ExactShape<JSONParsed<TrainingStep>, TrainingDayStepWire>>;
export type SuccessEnvelopeIsFullNonNullable = Assert<
  Same<TrainingDayRead, { success: true; data: TrainingDayWire }>
>;
export type StatusIncludesPausedAndReset = Assert<
  TrainingStatus.PAUSED | TrainingStatus.RESET extends TrainingDayStepWire["status"] ? true : false
>;
export type MissingProgressIdIsOptional = Assert<
  Same<TrainingDayStepWire["userStepId"], string | undefined>
>;
export type DisplayDayNullableAndOptional = Assert<
  Same<TrainingDayWire["displayDayNumber"], number | null | undefined>
>;
export type LockedTargetIsOpaqueAndOptional = Assert<
  Same<
    TrainingDayStepWire["monetizationTarget"],
    { targetType: "COURSE_STEP"; targetId: string } | undefined
  >
>;
export type RejectDateInNoDateWire = Assert<
  Not<Date extends TrainingDayWire["duration"] ? true : false>
>;
export type HonoConvertsDomainDatesToIso = Assert<Same<JSONParsed<Date>, string>>;
// This producer contains no Date fields: neither the client nor the API can
// infer completedAt/updatedAt solely from a different UserTraining domain.
export type RejectInventedCompletedAt = Assert<
  Not<"completedAt" extends keyof TrainingDayWire ? true : false>
>;
export type StatusIsExistingServerEnum = Assert<
  Same<TrainingDayStepWire["status"], TrainingStatus>
>;
export type LockedIsOptional = Assert<Same<TrainingDayStepWire["locked"], boolean | undefined>>;
export type PausedServerStateIsOptional = Assert<
  Same<TrainingDayStepWire["isPausedOnServer"], boolean | undefined>
>;
export type RejectNullableSuccessfulDetail = Assert<
  Not<null extends TrainingDayRead["data"] ? true : false>
>;
export type RejectMissingFullSteps = Assert<
  Not<"steps" extends keyof Omit<TrainingDayWire, "steps"> ? true : false>
>;
export type RejectUnexpectedTopLevel = Assert<
  Not<Same<TrainingDayWire & { email: string }, TrainingDayWire>>
>;
export type RejectNonNumericTimer = Assert<
  Not<string extends NonNullable<TrainingDayStepWire["remainingSecOnServer"]> ? true : false>
>;
