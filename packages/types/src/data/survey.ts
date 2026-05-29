export type SurveyPhase = "INITIAL" | "FINAL";

export type SurveyQuestionType =
  | "text"
  | "textarea"
  | "singleChoice"
  | "multiChoice"
  | "boolean"
  | "petSelect";

export type SurveyAnswerValue = string | string[] | boolean | null;

export interface SurveyOption {
  value: string;
  label: string;
  allowsOther?: boolean;
}

export interface SurveyQuestion {
  id: string;
  sectionId: string;
  type: SurveyQuestionType;
  title: string;
  description?: string;
  required?: boolean;
  options?: SurveyOption[];
  placeholder?: string;
}

export interface SurveySection {
  id: string;
  title: string;
  description?: string;
}

export interface SurveyTemplate {
  slug: string;
  familySlug: string;
  phase: SurveyPhase;
  version: number;
  title: string;
  description: string;
  sections: SurveySection[];
  questions: SurveyQuestion[];
}

export interface SurveyResponseDto {
  id: string;
  userId: string;
  courseId: string;
  stepId: string;
  petId: string | null;
  surveySlug: string;
  surveyFamilySlug: string;
  phase: SurveyPhase;
  surveyVersion: number;
  answers: Record<string, SurveyAnswerValue>;
  submittedAt: string;
  editableUntil: string;
  canEdit: boolean;
}

export interface SurveyComparisonItemDto {
  questionId: string;
  label?: string;
  before: SurveyAnswerValue;
  after: SurveyAnswerValue;
  changed: boolean;
}

export interface SurveyComparisonDto {
  familySlug: string;
  initialSubmittedAt: string;
  finalSubmittedAt: string;
  items: SurveyComparisonItemDto[];
}
