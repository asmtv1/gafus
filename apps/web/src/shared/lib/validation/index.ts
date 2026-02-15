// ===== БАЗОВЫЕ СХЕМЫ =====
export {
  // Утилиты
  trimmedNonEmptyString,
  numericField,

  // Общие схемы
  userIdSchema,
  optionalUserIdSchema,
  courseIdSchema,
  optionalCourseIdSchema,
  dayOnCourseIdSchema,
  courseIdEntitySchema,
  userStepIdSchema,
  stepIdEntitySchema,
  dayNumberSchema,
  trainingTypeSchema,
  optionalTrainingTypeSchema,
  stepIndexSchema,
  nonNegativeNumberSchema,
  positiveDurationSchema,
  dateSchema,
  urlSchema,
} from "./schemas";

// ===== СХЕМЫ АУТЕНТИФИКАЦИИ =====
export {
  // Поля
  usernameSchema,
  phoneSchema,
  passwordSchema,

  // Формы
  registerUserSchema,
  registerFormSchema,
  resetPasswordSchema,

  // Типы
  type RegisterUserSchema,
  type RegisterFormSchema,
  type ResetPasswordSchema,
} from "./authSchemas";

// ===== СХЕМЫ ПИТОМЦЕВ =====
export {
  // Схемы
  createPetSchema,
  petFormSchema,
  updatePetSchema,
  petIdSchema,

  // Типы
  type CreatePetSchema,
  type PetFormSchema,
  type UpdatePetSchema,
} from "./petSchemas";

// ===== СЕРВЕРНАЯ ВАЛИДАЦИЯ =====
export { validatePetForm, validateRegisterForm, validateData } from "./serverValidation";
