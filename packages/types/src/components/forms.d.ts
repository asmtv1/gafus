import type { UseFormReturn } from "react-hook-form";
import type { Control, FieldErrors, FieldValues } from "../types/react-types";
export type { ActionResult } from "../data/common";
export interface FormControlProps<T extends FieldValues> {
    control: Control<T>;
    errors: FieldErrors;
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
export interface FormFieldComponentProps<T extends FieldValues> {
    id: string;
    label?: string;
    name: string;
    type?: string;
    placeholder?: string;
    as?: "input" | "textarea" | "select";
    rules?: Record<string, unknown>;
    form: UseFormReturn<T>;
    options?: {
        value: string;
        label: string;
    }[];
    className?: string;
    disabled?: boolean;
    autoComplete?: string;
    ariaLabel?: string;
    visuallyHiddenLabel?: boolean;
    errorClassName?: string;
}
export interface FormFieldPropsExtended {
    label: string;
    name: string;
    type?: "text" | "email" | "password" | "number" | "textarea" | "select";
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    options?: {
        value: string;
        label: string;
    }[];
    rules?: Record<string, {
        required?: boolean;
        message?: string;
        pattern?: RegExp;
        min?: number;
        max?: number;
    }>;
    error?: string;
    className?: string;
}
