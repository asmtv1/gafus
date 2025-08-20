import type { Control, FieldErrors, FieldValues, UseFormReturn } from "react-hook-form";
export type { ActionResult } from "../data/common";
export interface FormControlProps<T extends FieldValues> {
  control: Control<T>;
  errors: FieldErrors<T>;
}
export interface FormProps<T extends FieldValues> {
  form: UseFormReturn<T>;
}
export interface CourseFormData {
  name: string;
  description: string;
  shortDesc: string;
  duration: string;
  logoImg: string;
  isPrivate: boolean;
  visibleDayIds: string[];
  allowedUserIds: string[];
  videoUrl?: string;
}
export interface PetFormFieldsData {
  name: string;
  type: "DOG" | "CAT";
  breed: string;
  birthDate: string;
  heightCm?: number;
  weightKg?: number;
  photoUrl?: string;
  notes?: string;
}
export interface TrainingDayFormData {
  title: string;
  description: string;
  type: string;
  visibleStepIds: string[];
}
export interface StepFormData {
  title: string;
  description: string;
  durationSec: number;
  imageUrls: string[];
  pdfUrls: string[];
  videoUrl?: string;
}
//# sourceMappingURL=forms.d.ts.map
