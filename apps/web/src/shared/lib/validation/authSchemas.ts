import { z } from "zod";
import parsePhoneNumberFromString from "libphonenumber-js";
import { coreRegisterEmailSchema } from "@gafus/core/validation/auth-register";
import {
  normalizeTelegramInput,
  normalizeInstagramInput,
  normalizeWebsiteUrl,
} from "@gafus/core/utils/social";

import { parsePetBirthDateInput } from "./petSchemas";

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
 * Схема для пароля (legacy, не ужесточать — используется там, где нужна мягкая проверка)
 */
export const passwordSchema = z
  .string()
  .min(6, "минимум 6 символов")
  .max(100, "максимум 100 символов")
  .regex(/^[A-Za-z0-9]+$/, "только английские буквы и цифры");

/**
 * Строгая схема пароля для регистрации и сброса. Спецсимволы разрешены.
 */
export const newPasswordSchema = z
  .string()
  .min(8, "минимум 8 символов")
  .max(100, "максимум 100 символов")
  .regex(/[A-Z]/, "минимум одна заглавная буква")
  .regex(/[a-z]/, "минимум одна строчная буква")
  .regex(/[0-9]/, "минимум одна цифра");

/**
 * Мягкая схема пароля только для логина (не блокировать старых пользователей).
 */
export const loginPasswordSchema = z.string().min(1, "Пароль обязателен").max(100, "максимум 100 символов");

/**
 * Схема установки пароля (VK-only пользователи).
 */
export const setPasswordSchema = z
  .object({
    newPassword: newPasswordSchema,
    confirmPassword: z.string().min(1, "Подтвердите пароль"),
  })
  .superRefine(({ newPassword, confirmPassword }, ctx) => {
    if (newPassword !== confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Пароли не совпадают",
      });
    }
  });

/**
 * Схема смены пароля.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Введите текущий пароль"),
    newPassword: newPasswordSchema,
    confirmNewPassword: z.string().min(1, "Подтвердите пароль"),
  })
  .superRefine(({ newPassword, confirmNewPassword }, ctx) => {
    if (newPassword !== confirmNewPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmNewPassword"],
        message: "Пароли не совпадают",
      });
    }
  });

// ===== СХЕМЫ ФОРМ =====

/** Email для регистрации: тот же контракт, что в @gafus/core (validator + FQDN домена). */
export const registerEmailSchema = coreRegisterEmailSchema;

/**
 * Базовая схема для регистрации пользователя (email + пароль)
 */
export const registerUserSchema = z.object({
  name: usernameSchema,
  email: registerEmailSchema,
  password: newPasswordSchema,
});

/**
 * Схема для формы регистрации с подтверждением пароля и согласием с документами
 */
const acceptRequired = (message: string) =>
  z.boolean().refine((v) => v === true, message);

export const registerFormSchema = registerUserSchema
  .extend({
    confirmPassword: z.string().min(1, "Подтвердите пароль"),
    acceptPersonalData: acceptRequired(
      "Необходимо дать согласие на обработку персональных данных",
    ),
    acceptPrivacyPolicy: acceptRequired(
      "Необходимо ознакомиться с Политикой конфиденциальности",
    ),
    acceptDataDistribution: acceptRequired(
      "Необходимо дать согласие на размещение данных в публичном профиле",
    ),
  })
  .superRefine(({ password, confirmPassword }, ctx) => {
    if (password !== confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Пароли не совпадают",
      });
    }
  });

/**
 * Схема для сброса пароля по токену из письма (API)
 */
export const resetPasswordSchema = z.object({
  token: z.string().trim().min(32).max(128),
  password: newPasswordSchema,
});

/**
 * Схема для входа в систему
 */
export const loginFormSchema = z.object({
  username: usernameSchema,
  password: loginPasswordSchema,
});

/**
 * Схема для смены логина
 */
export const usernameChangeSchema = z.object({
  newUsername: usernameSchema,
});

/**
 * Схема запроса сброса пароля (email)
 */
export const passwordResetFormSchema = z.object({
  email: coreRegisterEmailSchema,
});

/**
 * Форма сброса пароля: токен из письма + новый пароль
 */
export const resetPasswordFormSchema = z
  .object({
    token: z.string().trim().min(32).max(128),
    password: newPasswordSchema,
    confirmPassword: z.string().min(1, "Подтвердите пароль"),
  })
  .superRefine(({ password, confirmPassword }, ctx) => {
    if (password !== confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Пароли не совпадают",
      });
    }
  });

/**
 * Запрос смены email в профиле
 */
export const emailChangeRequestFormSchema = z.object({
  newEmail: coreRegisterEmailSchema,
});

/** Токен из ссылки подтверждения смены email */
export const emailChangeConfirmTokenSchema = z.object({
  token: z.string().trim().min(32).max(128),
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
    if (!val) return "";
    try {
      return normalizeTelegramInput(val);
    } catch (error) {
      throw new z.ZodError([
        {
          code: "custom",
          path: ["telegram"],
          message: error instanceof Error ? error.message : "Некорректный Telegram username",
        },
      ]);
    }
  })
  .refine((val) => !val || /^[a-z0-9_]{5,32}$/.test(val), {
    message:
      "Telegram username должен содержать минимум 5 символов, только латинские буквы, цифры и подчеркивание",
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
    if (!val) return "";
    try {
      return normalizeInstagramInput(val);
    } catch (error) {
      throw new z.ZodError([
        {
          code: "custom",
          path: ["instagram"],
          message: error instanceof Error ? error.message : "Некорректный Instagram username",
        },
      ]);
    }
  })
  .refine((val) => !val || (/^[a-z0-9._]{1,30}$/.test(val) && !val.endsWith(".")), {
    message:
      "Instagram username должен содержать до 30 символов, только латинские буквы, цифры, точки и подчеркивание, не может заканчиваться точкой",
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
    if (!val) return "";
    try {
      return normalizeWebsiteUrl(val);
    } catch (error) {
      throw new z.ZodError([
        {
          code: "custom",
          path: ["website"],
          message: error instanceof Error ? error.message : "Некорректный URL",
        },
      ]);
    }
  })
  .refine(
    (val) => {
      if (!val) return true;
      try {
        const url = new URL(val);
        return ["http:", "https:"].includes(url.protocol);
      } catch {
        return false;
      }
    },
    {
      message: "Некорректный URL. Разрешены только http:// и https:// протоколы",
    },
  );

/**
 * Схема для payload согласий — все три обязательны (literal true)
 */
export const consentPayloadSchema = z.object({
  acceptPersonalData: z.literal(true, {
    errorMap: () => ({
      message: "Необходимо дать согласие на обработку персональных данных",
    }),
  }),
  acceptPrivacyPolicy: z.literal(true, {
    errorMap: () => ({
      message: "Необходимо ознакомиться с Политикой конфиденциальности",
    }),
  }),
  acceptDataDistribution: z.literal(true, {
    errorMap: () => ({
      message:
        "Необходимо дать согласие на размещение данных в публичном профиле",
    }),
  }),
});

/** Схема формы согласий VK (boolean для чекбоксов, валидация — все true) */
export const vkConsentFormSchema = z.object({
  acceptPersonalData: acceptRequired(
    "Необходимо дать согласие на обработку персональных данных",
  ),
  acceptPrivacyPolicy: acceptRequired(
    "Необходимо ознакомиться с Политикой конфиденциальности",
  ),
  acceptDataDistribution: acceptRequired(
    "Необходимо дать согласие на размещение данных в публичном профиле",
  ),
});

/**
 * Схема для временного ID сессии согласия
 */
export const tempSessionIdSchema = z.string().uuid(
  "tempSessionId должен быть UUID",
);

/**
 * Схема для регистрации через API (с consent для GDPR)
 */
/** Паритет с POST /api/v1/auth/register и authRegisterBodySchema в @gafus/core */
export const registerApiSchema = registerUserSchema.extend({
  tempSessionId: tempSessionIdSchema,
  consentPayload: consentPayloadSchema,
});

/**
 * Схема для профиля пользователя
 */
export const userProfileFormSchema = z.object({
  fullName: z.string().trim().max(120, "Не более 120 символов").optional(),
  birthDate: z
    .union([z.string(), z.undefined()])
    .transform((s) => (typeof s === "string" ? s.trim() : ""))
    .superRefine((val, ctx) => {
      if (!val) return;
      const parsed = parsePetBirthDateInput(val);
      if (!parsed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Укажите дату в формате ДД.ММ.ГГГГ",
        });
        return;
      }
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      if (parsed > endOfToday) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Дата не может быть в будущем",
        });
      }
    })
    .transform((val) => {
      if (!val) return "";
      const parsed = parsePetBirthDateInput(val);
      if (!parsed) return "";
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, "0");
      const d = String(parsed.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }),
  about: z.string().trim().max(2000, "Не более 2000 символов").optional(),
  telegram: telegramUsernameSchema,
  instagram: instagramUsernameSchema,
  website: websiteUrlSchema,
});

// ===== ТИПЫ =====

export type ConsentPayloadSchema = z.infer<typeof consentPayloadSchema>;
export type TempSessionIdSchema = z.infer<typeof tempSessionIdSchema>;
export type RegisterUserSchema = z.infer<typeof registerUserSchema>;
export type RegisterFormSchema = z.infer<typeof registerFormSchema>;
export type ResetPasswordSchema = z.infer<typeof resetPasswordSchema>;
export type LoginFormSchema = z.infer<typeof loginFormSchema>;
export type UsernameChangeSchema = z.infer<typeof usernameChangeSchema>;
export type PasswordResetFormSchema = z.infer<typeof passwordResetFormSchema>;
export type ResetPasswordFormSchema = z.infer<typeof resetPasswordFormSchema>;
export type EmailChangeRequestFormSchema = z.infer<typeof emailChangeRequestFormSchema>;
export type UserProfileFormSchema = z.infer<typeof userProfileFormSchema>;
