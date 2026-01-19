// Типы для React - работают без зависимости от фреймворка
// Используем interface augmentation для совместимости

// Базовые типы React (заглушки, которые заменяются в runtime)
export type ReactNode = unknown;
export type ComponentType<P = Record<string, unknown>> = (props: P) => ReactNode;

// Типы для событий форм
export interface FormEvent {
  target: {
    value: string;
  };
  preventDefault: () => void;
}

export interface ChangeEvent {
  target: {
    value: string;
  };
}

export interface BlurEvent {
  target: {
    value: string;
  };
}

// Типы для хуков форм - используем interface augmentation
export interface Control<T = Record<string, unknown>> {
  register: (name: keyof T, options?: Record<string, unknown>) => Record<string, unknown>;
}

export type FieldErrors = Record<
  string,
  | {
      type: string;
      message: string;
    }
  | undefined
>;

export type FieldValues = Record<string, unknown>;

// Interface augmentation для react-hook-form
export interface UseFormReturn<T extends FieldValues = FieldValues> {
  control: Control<T>;
  errors: FieldErrors;
  handleSubmit: (onSubmit: (data: T) => void) => (event: FormEvent) => void;
  watch: (name?: keyof T) => unknown;
  setValue: (name: keyof T, value: unknown) => void;
  getValues: (name?: keyof T) => unknown;
  reset: (values?: Partial<T>) => void;
  formState: {
    isSubmitting: boolean;
    isValid: boolean;
    errors: FieldErrors;
    isDirty: boolean;
    submitCount: number;
    isSubmitted: boolean;
    isSubmitSuccessful: boolean;
    isValidating: boolean;
    touchedFields: Partial<Record<keyof T, boolean>>;
    dirtyFields: Partial<Record<keyof T, boolean>>;
  };
  register: (name: keyof T, options?: Record<string, unknown>) => Record<string, unknown>;
  // Дополнительные поля для совместимости
  getFieldState: (name: keyof T) => {
    invalid: boolean;
    isTouched: boolean;
    isDirty: boolean;
    error?: { type: string; message: string };
  };
  clearErrors: (name?: keyof T | (keyof T)[]) => void;
  setError: (name: keyof T, error: { type: string; message: string }) => void;
  trigger: (name?: keyof T | (keyof T)[]) => Promise<boolean>;
  unregister: (name?: keyof T | (keyof T)[]) => void;
  // Индексная сигнатура для дополнительных полей
  [key: string]: unknown;
}
