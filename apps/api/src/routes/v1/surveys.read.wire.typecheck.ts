/** AG1-002 survey GET: type-only existing READ application → Hono JSON wire proof. */
import type { JSONParsed } from "hono/utils/types";
import type { readSurveysApplication } from "../../modules/surveys/composition/read-surveys";
import type {
  SurveyBySlugRead,
  SurveyComparisonRead,
  SurveyTemplate,
  SurveyResponseDto,
  SurveyComparisonDto,
} from "../../../../../packages/types/src/data/survey";

type Same<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;
type Assert<T extends true> = T;
type Not<T extends boolean> = T extends false ? true : false;

type CoreTemplate = NonNullable<ReturnType<typeof readSurveysApplication.getTemplate>>;
type CoreResponse = Awaited<ReturnType<typeof readSurveysApplication.getResponse>>;
type CoreComparison = Awaited<ReturnType<typeof readSurveysApplication.getComparison>>;

// Existing application does allow missing templates/response/comparisons;
// only the registered :slug route excludes null template from success JSON.
export type TemplateLookupMayBeMissing = Assert<
  Same<ReturnType<typeof readSurveysApplication.getTemplate>, SurveyTemplate | null>
>;
export type ResponseLookupMayBeMissing = Assert<Same<CoreResponse, SurveyResponseDto | null>>;
export type ComparisonLookupMayBeMissing = Assert<Same<CoreComparison, SurveyComparisonDto | null>>;

// Compare the actual injected READ producer, not a duplicate handwritten DTO.
export type ActualSlugJSONMatchesCanonicalRead = Assert<
  Same<JSONParsed<{ template: CoreTemplate; response: CoreResponse }>, SurveyBySlugRead["data"]>
>;
export type ActualComparisonJSONMatchesCanonicalRead = Assert<
  Same<JSONParsed<CoreComparison>, SurveyComparisonRead["data"]>
>;
export type ActualDTOFieldsReused = Assert<
  Same<SurveyBySlugRead["data"], { template: SurveyTemplate; response: SurveyResponseDto | null }> &
    Same<SurveyComparisonRead["data"], SurveyComparisonDto | null>
>;
export type OptionalStepIdReturnsNullResponse = Assert<
  Same<SurveyBySlugRead["data"]["response"], SurveyResponseDto | null>
>;
export type MissingComparisonIsSuccessfulNull = Assert<
  Same<SurveyComparisonRead["data"], SurveyComparisonDto | null>
>;
export type TemplateIsNotSuccessNull = Assert<
  Not<null extends SurveyBySlugRead["data"]["template"] ? true : false>
>;
export type MissingSlugIsNotSuccessNull = Assert<
  Not<null extends SurveyBySlugRead["data"] ? true : false>
>;
export type RejectExtraSlugResponseField = Assert<
  Not<Same<SurveyBySlugRead["data"] & { privateStudentId: string }, SurveyBySlugRead["data"]>>
>;
export type RejectComparisonDateObjects = Assert<
  Not<Date extends SurveyComparisonDto["initialSubmittedAt"] ? true : false>
>;
export type ReadEnvelopeRequiresSuccessTrue = Assert<
  Same<SurveyBySlugRead["success"], true> & Same<SurveyComparisonRead["success"], true>
>;
