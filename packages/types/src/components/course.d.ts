import type { CourseCardProps, CourseWithProgressData, DayLink } from "../data/course";
import type { Control, FieldErrors } from "../types";
interface BaseUser {
    id: string;
    username: string;
}
interface BaseDay {
    id: string;
    title: string;
}
interface CourseFormData {
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
export interface FavoriteButtonProps {
    id: string;
    isFavorite?: boolean;
    onUnfavorite?: (courseId: string) => void;
}
export interface CourseRatingProps {
    courseId: string;
    initialRating: number;
    readOnly?: boolean;
    size?: "small" | "medium" | "large";
}
export interface LegacyCourseRatingProps {
    value: number;
    readOnly?: boolean;
    size?: "small" | "medium" | "large";
}
export interface ClientCourseRatingProps {
    courseId: string;
    initialRating: number;
    userId?: string;
    existingReview?: boolean;
    userRating?: number;
    canRate?: boolean;
}
export type CourseCardPropsWithIndex = CourseCardProps & {
    index: number;
};
export interface PopularCoursesProps {
    limit?: number;
    className?: string;
    title?: string;
}
export interface FavoritesCourseListCourse {
    id: string;
    title: string;
    coverImageUrl: string;
    isFavorite: boolean;
    description?: string;
    level?: string;
    duration?: string;
    frequency?: string;
    createdAt?: Date;
    updatedAt?: Date;
    [key: string]: unknown;
}
export interface FavoritesListProps {
    courses: FavoritesCourseListCourse[];
}
export interface CourseDetailsFieldsProps {
    control: Control<CourseFormData>;
    errors: FieldErrors;
}
export interface CourseVisibilitySelectorProps {
    control: Control<CourseFormData>;
}
export type CourseFormUser = BaseUser;
export type CourseFormDay = BaseDay;
export interface CourseFormProps {
    onSubmit: (data: CourseFormData) => Promise<void>;
    initialData?: Partial<CourseFormData>;
    isSubmitting?: boolean;
    className?: string;
}
export interface CourseFormFieldProps {
    label: string;
    name: keyof CourseFormData;
    type?: "text" | "textarea" | "select" | "number";
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    options?: {
        value: string;
        label: string;
    }[];
    control: Control<CourseFormData>;
    errors: FieldErrors;
}
export interface CourseListProps {
    courses: CourseWithProgressData[];
    onCourseSelect: (course: CourseWithProgressData) => void;
    selectedCourseId?: string;
}
export interface CourseStepProps {
    step: {
        id: string;
        title: string;
        description: string;
    };
    onStepComplete: (stepId: string) => void;
    isCompleted: boolean;
}
export interface CourseDayProps {
    day: DayLink;
    steps: DayLink["day"]["stepLinks"];
    onStepComplete: (stepId: string) => void;
    completedSteps: string[];
}
export type DaySelectorDay = BaseDay;
export type PrivateUsersSelectorUser = BaseUser;
export interface PrivateUsersSelectorProps {
    control: Control<CourseFormData>;
    users: PrivateUsersSelectorUser[];
}
export type { CourseCardProps };
