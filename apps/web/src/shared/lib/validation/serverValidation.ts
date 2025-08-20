import type { PetFormData, RegisterFormData, ValidationResult } from "@gafus/types";

// Типы для результатов валидации

// Серверная валидация для формы питомца
export function validatePetForm(data: PetFormData): ValidationResult {
  const errors: Record<string, string> = {};

  // Валидация имени
  if (!data.name || data.name.trim().length === 0) {
    errors.name = "Имя питомца обязательно";
  } else if (data.name.length < 2) {
    errors.name = "Имя должно содержать минимум 2 символа";
  } else if (data.name.length > 50) {
    errors.name = "Имя не может быть длиннее 50 символов";
  } else if (!/^[а-яёА-ЯЁa-zA-Z\s-]+$/.test(data.name)) {
    errors.name = "Имя может содержать только буквы, пробелы и дефис";
  }

  // Валидация типа
  if (!data.type) {
    errors.type = "Тип питомца обязателен";
  } else if (!["DOG", "CAT"].includes(data.type)) {
    errors.type = "Неверный тип питомца";
  }

  // Валидация породы
  if (!data.breed || data.breed.trim().length === 0) {
    errors.breed = "Порода обязательна";
  } else if (data.breed.length < 2) {
    errors.breed = "Порода должна содержать минимум 2 символа";
  } else if (data.breed.length > 50) {
    errors.breed = "Порода не может быть длиннее 50 символов";
  }

  // Валидация даты рождения
  if (!data.birthDate) {
    errors.birthDate = "Дата рождения обязательна";
  } else {
    const birthDate = new Date(data.birthDate);
    const today = new Date();
    const minDate = new Date("1990-01-01");

    if (isNaN(birthDate.getTime())) {
      errors.birthDate = "Неверный формат даты";
    } else if (birthDate > today) {
      errors.birthDate = "Дата не может быть в будущем";
    } else if (birthDate < minDate) {
      errors.birthDate = "Дата слишком старая";
    }
  }

  // Валидация роста
  console.warn("Валидация роста - heightCm:", data.heightCm, "тип:", typeof data.heightCm);
  if (data.heightCm !== undefined && data.heightCm !== null) {
    const height = Number(data.heightCm);
    if (isNaN(height)) {
      errors.heightCm = "Рост должен быть числом";
    } else if (height < 1) {
      errors.heightCm = "Рост должен быть больше 0";
    } else if (height > 200) {
      errors.heightCm = "Рост не может быть больше 200 см";
    }
  }

  // Валидация веса
  console.warn("Валидация веса - weightKg:", data.weightKg, "тип:", typeof data.weightKg);
  if (data.weightKg !== undefined && data.weightKg !== null) {
    const weight = Number(data.weightKg);
    if (isNaN(weight)) {
      errors.weightKg = "Вес должен быть числом";
    } else if (weight < 0.1) {
      errors.weightKg = "Вес должен быть больше 0";
    } else if (weight > 200) {
      errors.weightKg = "Вес не может быть больше 200 кг";
    }
  }

  // Валидация заметок
  if (data.notes && data.notes.length > 500) {
    errors.notes = "Заметки не могут быть длиннее 500 символов";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// Серверная валидация для формы регистрации
export function validateRegisterForm(data: RegisterFormData): ValidationResult {
  const errors: Record<string, string> = {};

  // Валидация имени пользователя
  if (!data.name || data.name.trim().length === 0) {
    errors.name = "Имя пользователя обязательно";
  } else if (data.name.length < 4) {
    errors.name = "Имя должно содержать минимум 4 символа";
  } else if (data.name.length > 10) {
    errors.name = "Имя не может быть длиннее 10 символов";
  } else if (!/^[A-Za-z0-9_]+$/.test(data.name)) {
    errors.name = "Имя может содержать только английские буквы, цифры и _";
  }

  // Валидация телефона
  if (!data.phone || data.phone.trim().length === 0) {
    errors.phone = "Телефон обязателен";
  } else if (!/^\+?[1-9]\d{1,14}$/.test(data.phone.replace(/\s/g, ""))) {
    errors.phone = "Неверный формат телефона";
  }

  // Валидация пароля
  if (!data.password || data.password.length === 0) {
    errors.password = "Пароль обязателен";
  } else if (data.password.length < 6) {
    errors.password = "Пароль должен содержать минимум 6 символов";
  } else if (data.password.length > 12) {
    errors.password = "Пароль не может быть длиннее 12 символов";
  } else if (!/^[A-Za-z0-9]+$/.test(data.password)) {
    errors.password = "Пароль может содержать только английские буквы и цифры";
  }

  // Валидация подтверждения пароля
  if (!data.confirmPassword || data.confirmPassword.length === 0) {
    errors.confirmPassword = "Подтвердите пароль";
  } else if (data.confirmPassword !== data.password) {
    errors.confirmPassword = "Пароли не совпадают";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// Универсальная функция валидации
export function validateForm<T extends Record<string, unknown>>(
  data: T,
  validationRules: Record<string, (value: unknown) => string | null>,
): ValidationResult {
  const errors: Record<string, string> = {};

  for (const [field, validator] of Object.entries(validationRules)) {
    const error = validator(data[field]);
    if (error) {
      errors[field] = error;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// Хелперы для создания валидаторов
export const validators = {
  required:
    (message = "Поле обязательно") =>
    (value: unknown) =>
      !value || (typeof value === "string" && value.trim() === "") ? message : null,

  minLength: (min: number, message: string) => (value: string) =>
    !value || value.length < min ? message : null,

  maxLength: (max: number, message: string) => (value: string) =>
    value && value.length > max ? message : null,

  pattern: (regex: RegExp, message: string) => (value: string) =>
    value && !regex.test(value) ? message : null,

  email:
    (message = "Неверный формат email") =>
    (value: string) =>
      value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? message : null,

  phone:
    (message = "Неверный формат телефона") =>
    (value: string) =>
      value && !/^\+?[1-9]\d{1,14}$/.test(value.replace(/\s/g, "")) ? message : null,

  number: (min?: number, max?: number, message?: string) => (value: unknown) => {
    if (value === undefined || value === null || value === "") return null;
    const num = Number(value);
    if (isNaN(num)) return message || "Должно быть числом";
    if (min !== undefined && num < min) return message || `Минимум ${min}`;
    if (max !== undefined && num > max) return message || `Максимум ${max}`;
    return null;
  },

  date:
    (message = "Неверный формат даты") =>
    (value: string) => {
      if (!value) return null;
      const date = new Date(value);
      if (isNaN(date.getTime())) return message;
      if (date > new Date()) return "Дата не может быть в будущем";
      return null;
    },
};
