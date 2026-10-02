import { z } from "zod";
import { normalizeRuPhoneForStorage } from "./ru-phone";
const CONSULTATION_PET_GENDER = ["MALE", "FEMALE"] as const;

const trimNonEmpty = (max: number, label: string) =>
  z.string().trim().min(1, `Заполните поле «${label}»`).max(max, `Не длиннее ${max} символов`);

/** Имя владельца и кличка питомца: 2–15 символов. */
const shortName = (label: string) =>
  z
    .string()
    .trim()
    .min(2, `Минимум 2 символа в «${label}»`)
    .max(15, `Не больше 15 символов в «${label}»`);

const phoneForBooking = z
  .string()
  .min(1, "Введите номер телефона")
  .transform((raw) => raw.trim())
  .superRefine((raw, ctx) => {
    const n = normalizeRuPhoneForStorage(raw);
    if (!n) {
      ctx.addIssue({
        code: "custom",
        message: "Некорректный номер. Укажите с кодом страны (+7, +998, +375…).",
      });
    }
  })
  .transform((raw) => normalizeRuPhoneForStorage(raw)!);

export const cynologistIntakeSchema = z.object({
  clientOwnerName: shortName("имя владельца"),
  clientPhone: phoneForBooking,
  petName: shortName("кличка питомца"),
  petGender: z.enum(CONSULTATION_PET_GENDER, {
    errorMap: () => ({ message: "Укажите пол питомца" }),
  }),
  petAge: trimNonEmpty(100, "возраст питомца"),
  petBreed: trimNonEmpty(200, "породу питомца"),
  clientProblem: z
    .string()
    .trim()
    .min(10, "Опишите проблему не менее чем в 10 символах")
    .max(1000, "Не длиннее 1000 символов"),
  clientSelfHelpAttempt: z
    .string()
    .trim()
    .min(1, "Заполните поле «как пытались решить проблему»")
    .max(1000, "Не длиннее 1000 символов"),
});
export type CynologistIntake = z.infer<typeof cynologistIntakeSchema>;
export const INTAKE_FIELDS = [
  ["clientOwnerName", "Имя владельца", 15],
  ["clientPhone", "Телефон", 32],
  ["petName", "Кличка питомца", 15],
  ["petGender", "Пол питомца", 6],
  ["petAge", "Возраст питомца", 100],
  ["petBreed", "Порода питомца", 200],
  ["clientProblem", "Проблема", 1000],
  ["clientSelfHelpAttempt", "Как пытались решить проблему", 1000],
] as const;
export function formatCynologistIntake(value: CynologistIntake): string {
  return (
    "Анкета перед началом переписки\n\n" +
    INTAKE_FIELDS.map(
      ([key, label]) =>
        `- ${label}: ${key === "petGender" ? (value[key] === "MALE" ? "Мальчик" : "Девочка") : value[key]}`,
    ).join("\n")
  );
}
