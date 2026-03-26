import { z } from "zod";

import { coreRegisterEmailSchema } from "./registerEmailDomain";

export { coreRegisterEmailSchema, isRegisterEmailWithValidDomain } from "./registerEmailDomain";

/**
 * Общая схема регистрации (email + пароль) для API, web и core.
 * Email: пакет `validator` (формат + FQDN домена с TLD), см. registerEmailDomain.ts.
 */
export const coreRegisterUsernameSchema = z
  .string()
  .trim()
  .min(3, "минимум 3 символа")
  .max(50, "максимум 50 символов")
  .regex(/^[A-Za-z0-9_]+$/, "только английские буквы, цифры и _")
  .transform((v) => v.toLowerCase());

export const coreRegisterPasswordSchema = z
  .string()
  .min(8, "минимум 8 символов")
  .max(100, "максимум 100 символов")
  .regex(/[A-Z]/, "минимум одна заглавная буква")
  .regex(/[a-z]/, "минимум одна строчная буква")
  .regex(/[0-9]/, "минимум одна цифра");

export const coreRegisterConsentPayloadSchema = z.object({
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

export const authRegisterBodySchema = z.object({
  name: coreRegisterUsernameSchema,
  email: coreRegisterEmailSchema,
  password: coreRegisterPasswordSchema,
  tempSessionId: z.string().uuid("tempSessionId должен быть UUID"),
  consentPayload: coreRegisterConsentPayloadSchema,
});

export type AuthRegisterBody = z.infer<typeof authRegisterBodySchema>;
