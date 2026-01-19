import { z } from "zod";
import parsePhoneNumberFromString from "libphonenumber-js";
import { normalizeTelegramInput, normalizeInstagramInput, normalizeWebsiteUrl } from "@gafus/core/utils/social";

// ===== СХЕМЫ АУТЕНТИФИКАЦИИ =====

/**
 * Схема для имени пользователя
 */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "минимум 3 символа")
  .max(50, "максимум 50 символов")
  .regex(/^[A-Za-z0-9_]+$/, "только английские буквы, цифры и _");

/**
 * Схема для номера телефона с валидацией через libphonenumber-js
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Номер телефона обязателен")
  .refine((value) => {
    const phone = parsePhoneNumberFromString(value, "RU");
    return !!phone && phone.isValid();
  }, "Неверный формат номера телефона");

/**
 * Схема для пароля
 */
export const passwordSchema = z
  .string()
  .min(6, "минимум 6 символов")
  .max(100, "максимум 100 символов")
  .regex(/^[A-Za-z0-9]+$/, "только английские буквы и цифры");

// ===== СХЕМЫ ФОРМ =====

/**
 * Базовая схема для регистрации пользователя
 */
export const registerUserSchema = z.object({
  name: usernameSchema,
  phone: phoneSchema,
  password: passwordSchema,
});

/**
 * Схема для формы регистрации с подтверждением пароля
 */
export const registerFormSchema = registerUserSchema.extend({
  confirmPassword: z
    .string()
    .min(1, "Подтвердите пароль"),
}).superRefine(({ password, confirmPassword }, ctx) => {
  if (password !== confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmPassword"],
      message: "Пароли не совпадают",
    });
  }
});

/**
 * Схема для сброса пароля
 */
export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, "Токен обязателен").max(500),
  password: passwordSchema,
});

/**
 * Схема для входа в систему
 */
export const loginFormSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

/**
 * Схема для запроса сброса пароля
 */
export const passwordResetFormSchema = z.object({
  username: usernameSchema,
  phone: phoneSchema,
});

/**
 * Схема для формы сброса пароля с подтверждением
 */
export const resetPasswordFormSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Подтвердите пароль"),
}).superRefine(({ password, confirmPassword }, ctx) => {
  if (password !== confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmPassword"],
      message: "Пароли не совпадают",
    });
  }
});

/**
 * Схема для Telegram username с валидацией и нормализацией
 */
const telegramUsernameSchema = z
  .string()
  .trim()
  .max(100, "Не более 100 символов")
  .optional()
  .transform((val) => {
    if (!val) return '';
    try {
      return normalizeTelegramInput(val);
    } catch (error) {
      throw new z.ZodError([{
        code: 'custom',
        path: ['telegram'],
        message: error instanceof Error ? error.message : 'Некорректный Telegram username'
      }]);
    }
  })
  .refine((val) => !val || /^[a-z0-9_]{5,32}$/.test(val), {
    message: 'Telegram username должен содержать минимум 5 символов, только латинские буквы, цифры и подчеркивание'
  });

/**
 * Схема для Instagram username с валидацией и нормализацией
 */
const instagramUsernameSchema = z
  .string()
  .trim()
  .max(100, "Не более 100 символов")
  .optional()
  .transform((val) => {
    if (!val) return '';
    try {
      return normalizeInstagramInput(val);
    } catch (error) {
      throw new z.ZodError([{
        code: 'custom',
        path: ['instagram'],
        message: error instanceof Error ? error.message : 'Некорректный Instagram username'
      }]);
    }
  })
  .refine((val) => !val || (/^[a-z0-9._]{1,30}$/.test(val) && !val.endsWith('.')), {
    message: 'Instagram username должен содержать до 30 символов, только латинские буквы, цифры, точки и подчеркивание, не может заканчиваться точкой'
  });

/**
 * Схема для website URL с валидацией и нормализацией
 */
const websiteUrlSchema = z
  .string()
  .trim()
  .max(200, "Не более 200 символов")
  .optional()
  .transform((val) => {
    if (!val) return '';
    try {
      return normalizeWebsiteUrl(val);
    } catch (error) {
      throw new z.ZodError([{
        code: 'custom',
        path: ['website'],
        message: error instanceof Error ? error.message : 'Некорректный URL'
      }]);
    }
  })
  .refine((val) => {
    if (!val) return true;
    try {
      const url = new URL(val);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }, {
    message: 'Некорректный URL. Разрешены только http:// и https:// протоколы'
  });

/**
 * Схема для профиля пользователя
 */
export const userProfileFormSchema = z.object({
  fullName: z.string().trim().max(120, "Не более 120 символов").optional(),
  birthDate: z.string().optional().refine((value) => {
    if (!value) return true;
    return new Date(value) <= new Date();
  }, "Дата не может быть в будущем"),
  about: z.string().trim().max(2000, "Не более 2000 символов").optional(),
  telegram: telegramUsernameSchema,
  instagram: instagramUsernameSchema,
  website: websiteUrlSchema,
});

// ===== ТИПЫ =====

export type RegisterUserSchema = z.infer<typeof registerUserSchema>;
export type RegisterFormSchema = z.infer<typeof registerFormSchema>;
export type ResetPasswordSchema = z.infer<typeof resetPasswordSchema>;
export type LoginFormSchema = z.infer<typeof loginFormSchema>;
export type PasswordResetFormSchema = z.infer<typeof passwordResetFormSchema>;
export type ResetPasswordFormSchema = z.infer<typeof resetPasswordFormSchema>;
export type UserProfileFormSchema = z.infer<typeof userProfileFormSchema>;
