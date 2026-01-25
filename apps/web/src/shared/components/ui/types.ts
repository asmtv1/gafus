// UI-специфичные типы для shared компонентов

import type { UseFormReturn, FieldValues } from "react-hook-form";

export interface OptimizedImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  index?: number;
  isAboveFold?: boolean;
  isCritical?: boolean;
  placeholder?: string;
  unoptimized?: boolean;
  priority?: boolean;
  loading?: "lazy" | "eager";
  onError?: () => void;
  style?: React.CSSProperties;
}

export interface CoursesSkeletonProps {
  count?: number;
}

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
}

export interface PasswordInputProps {
  error?: string;
  type?: string;
  placeholder?: string;
  value?: string;
  onChange?: (event: { target: { value: string } }) => void;
  onBlur?: (event: { target: { value: string } }) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  required?: boolean;
  autoComplete?: string;
  label?: string;
  visuallyHiddenLabel?: boolean;
  ariaLabel?: string;
  errorClassName?: string;
  [key: string]: unknown;
}

export interface FormFieldProps<T> {
  control: {
    register: (name: keyof T) => {
      onChange: (event: { target: { value: string } }) => void;
      onBlur: () => void;
      name: keyof T;
    };
  };
  name: keyof T;
  label: string;
  type?: string;
  placeholder?: string;
  rules?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    validate?: (value: unknown) => boolean | string;
  };
  className?: string;
}

export interface BurgerIconProps {
  onClick?: () => void;
}

export interface DualListSelectorProps<T> {
  availableItems: T[];
  selectedItems: T[];
  onItemsChange: (selectedItems: T[]) => void;
  getItemKey: (item: T) => string;
  getItemLabel: (item: T) => string;
  availableTitle?: string;
  selectedTitle?: string;
  placeholder?: string;
  className?: string;
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
  options?: { value: string; label: string }[];
  className?: string;
  disabled?: boolean;
  autoComplete?: string;
  ariaLabel?: string;
  visuallyHiddenLabel?: boolean;
  errorClassName?: string;
}
