import { useForm } from "react-hook-form";

import type { PetFormData } from "@gafus/types";

// Схема валидации для формы питомца
const petValidationRules = {
  name: {
    required: "Имя питомца обязательно",
    minLength: { value: 2, message: "Минимум 2 символа" },
    maxLength: { value: 50, message: "Максимум 50 символов" },
    pattern: {
      value: /^[а-яёА-ЯЁa-zA-Z\s-]+$/,
      message: "Только буквы, пробелы и дефис",
    },
  },
  type: {
    required: "Выберите тип питомца",
    validate: (value: string | number | undefined) => {
      if (typeof value !== "string") return "Выберите тип питомца";
      return ["DOG", "CAT"].includes(value) || "Выберите DOG или CAT";
    },
  },
  breed: {
    required: "Порода обязательна",
    minLength: { value: 2, message: "Минимум 2 символа" },
    maxLength: { value: 50, message: "Максимум 50 символов" },
    pattern: {
      value: /^[а-яёА-ЯЁa-zA-Z\s-]+$/,
      message: "Только буквы, пробелы и дефис",
    },
  },
  birthDate: {
    required: "Дата рождения обязательна",
    validate: (value: string | number | undefined) => {
      if (typeof value !== "string" || !value) return "Введите дату";
      const date = new Date(value);
      const today = new Date();
      const minDate = new Date("1990-01-01");

      if (isNaN(date.getTime())) {
        return "Неверный формат даты";
      }
      if (date > today) {
        return "Дата не может быть в будущем";
      }
      if (date < minDate) {
        return "Дата слишком старая";
      }
      return true;
    },
  },
  heightCm: {
    setValueAs: (value: string | number) => {
      if (value === "" || value === undefined || value === null) return undefined;
      const num = Number(value);
      return isNaN(num) ? undefined : num;
    },  
    validate: (value: number | undefined) => {
      if (value === undefined || value === null) return true;
      if (value < 1) return "Рост должен быть больше 0";
      if (value > 200) return "Рост не может быть больше 200 см";
      return true;
    },
  },
  weightKg: {
    setValueAs: (value: string | number) => {
      if (value === "" || value === undefined || value === null) return undefined;
      const num = Number(value);
      return isNaN(num) ? undefined : num;
    },
    validate: (value: number | undefined) => {
      if (value === undefined || value === null) return true;
      if (value < 0.1) return "Вес должен быть больше 0";
      if (value > 200) return "Вес не может быть больше 200 кг";
      return true;
    },
  },
  notes: {
    maxLength: { value: 500, message: "Максимум 500 символов" },
  },
};

export function usePetForm(initialValues: Partial<PetFormData>) {
  return useForm<PetFormData>({
    mode: "onBlur",
    defaultValues: {
      id: "",
      name: "",
      type: "",
      breed: "",
      birthDate: "",
      heightCm: undefined,
      weightKg: undefined,
      photoUrl: "",
      notes: "",
      ...initialValues,
    },
  });
}

// Хук с валидацией
export function usePetFormWithValidation(initialValues: Partial<PetFormData>) {
  return useForm<PetFormData>({
    mode: "onBlur",
    defaultValues: {
      id: "",
      name: "",
      type: "",
      breed: "",
      birthDate: "",
      heightCm: undefined,
      weightKg: undefined,
      photoUrl: "",
      notes: "",
      ...initialValues,
    },
  });
}

// Функция для получения правил валидации
export function getPetValidationRules() {
  return petValidationRules;
}
