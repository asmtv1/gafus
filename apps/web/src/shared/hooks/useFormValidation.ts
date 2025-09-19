import { useForm } from "react-hook-form";

import type { RegisterOptions, FieldValues, FieldPath, DefaultValues } from "react-hook-form";

// Типы для валидации
export interface ValidationRule<T> {
  required?: string | boolean;
  minLength?: { value: number; message: string };
  maxLength?: { value: number; message: string };
  min?: { value: number; message: string };
  max?: { value: number; message: string };
  pattern?: { value: RegExp; message: string };
  validate?: (value: T) => boolean | string;
}

export type ValidationSchema<T extends FieldValues> = {
  [K in FieldPath<T>]?: RegisterOptions<T, K>;
};

// Универсальный хук для создания формы с валидацией
export function useFormWithValidation<T extends FieldValues>(
  defaultValues: T,
  validationSchema?: ValidationSchema<T>,
) {
  const form = useForm<T>({
    mode: "onBlur",
    defaultValues: defaultValues as DefaultValues<T>,
  });

  // Функция для проверки валидности всей формы
  const isFormValid = form.formState.isValid;

  // Функция для получения всех ошибок
  const getErrors = form.formState.errors;

  return {
    form,
    isFormValid,
    getErrors,
    handleSubmit: form.handleSubmit,
    register: form.register,
    setValue: form.setValue,
    getValues: form.getValues,
    reset: form.reset,
    setError: form.setError,
    clearErrors: form.clearErrors,
  };
}

// Предустановленные правила валидации
export const commonValidationRules = {
  required: (message = "Это поле обязательно") => ({ required: message }),

  email: {
    required: "Email обязателен",
    pattern: {
      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
      message: "Неверный формат email",
    },
  },

  phone: {
    required: "Телефон обязателен",
    pattern: {
      value: /^\+?[1-9]\d{1,14}$/,
      message: "Неверный формат телефона",
    },
  },

  password: {
    required: "Пароль обязателен",
    minLength: { value: 6, message: "Минимум 6 символов" },
    maxLength: { value: 50, message: "Максимум 50 символов" },
  },

  name: {
    required: "Имя обязательно",
    minLength: { value: 2, message: "Минимум 2 символа" },
    maxLength: { value: 50, message: "Максимум 50 символов" },
    pattern: {
      value: /^[а-яёА-ЯЁa-zA-Z\s-]+$/,
      message: "Только буквы, пробелы и дефис",
    },
  },

  number: (min?: number, max?: number) => ({
    validate: (value: string | number | undefined) => {
      if (value === undefined || value === null || value === "") return true;
      const numValue = typeof value === "string" ? parseFloat(value) : value;
      if (isNaN(numValue)) return "Введите число";
      if (min !== undefined && numValue < min) return `Минимум ${min}`;
      if (max !== undefined && numValue > max) return `Максимум ${max}`;
      return true;
    },
  }),

  date: {
    required: "Дата обязательна",
    validate: (value: string | number | undefined) => {
      if (!value || typeof value !== "string") return "Введите дату";
      const date = new Date(value);
      const today = new Date();

      if (isNaN(date.getTime())) {
        return "Неверный формат даты";
      }
      if (date > today) {
        return "Дата не может быть в будущем";
      }
      return true;
    },
  },
};

// Хук для создания формы с предустановленными правилами
export function useCommonForm<T extends FieldValues>(
  defaultValues: T,
  validationRules: ValidationSchema<T>,
) {
  return useFormWithValidation(defaultValues, validationRules);
}
