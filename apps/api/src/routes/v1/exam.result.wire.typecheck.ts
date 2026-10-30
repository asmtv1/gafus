/** AG1-002/LEARN032: erased-only strict producer JSON wire conformance. */
import type { JSONParsed } from "hono/utils/types";
import type { ExamResultData } from "@gafus/core/services/exam";
import type { ExamResultRead, ExamResultWire } from "../../../../../packages/types/src/data/exam";

type Same<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;
type Assert<T extends true> = T;
type Not<T extends boolean> = T extends false ? true : false;

// Hono's actual JSON serialization, not manually stringified Core domain dates.
export type ProducerMatchesCanonicalExamWire = Assert<
  Same<JSONParsed<ExamResultData>, ExamResultWire>
>;
export type ResponseIsSuccessfulNonNull = Assert<
  Same<ExamResultRead, { success: true; data: ExamResultWire }>
>;
export type ReviewedNullableIsoDate = Assert<Same<ExamResultWire["reviewedAt"], string | null>>;
export type NestedReviewProfileNullable = Assert<
  Same<
    ExamResultWire["reviewedBy"],
    {
      username: string;
      profile: { fullName: string | null } | null;
    } | null
  >
>;
export type TestAnswersNullableNumeric = Assert<
  Same<ExamResultWire["testAnswers"], Record<string, number> | null>
>;
export type RequiredIsoDates = Assert<
  Same<ExamResultWire["createdAt"], string> & Same<ExamResultWire["updatedAt"], string>
>;
// Negative exact-shape guards: Date, extra producer fields, null success, and
// nonnumeric test answer payload must never be accepted as this JSON wire.
export type RejectDomainDate = Assert<Not<Date extends ExamResultWire["createdAt"] ? true : false>>;
export type RejectExtraShape = Assert<
  Not<Same<ExamResultWire & { privateUserId: string }, ExamResultWire>>
>;
export type RejectNullableSuccess = Assert<Not<null extends ExamResultRead["data"] ? true : false>>;
export type RejectNonNumericAnswers = Assert<
  Not<Record<string, string> extends NonNullable<ExamResultWire["testAnswers"]> ? true : false>
>;
