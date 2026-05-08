import { PetType } from "@gafus/prisma";
import { z } from "zod";

const MIN_BIRTH_DATE = new Date("1990-01-01");

const optionalUrlSchema = z
  .string()
  .trim()
  .url("Неверный формат URL")
  .optional()
  .or(z.literal("").optional());

function numericField(options: { min: number; max: number; field: string; unit: string }) {
  return z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === null || value === undefined) {
        return undefined;
      }
      if (typeof value === "number") {
        return Number.isNaN(value) ? NaN : value;
      }
      const trimmed = value.trim();
      if (trimmed === "") {
        return undefined;
      }
      const normalized = trimmed.replace(",", ".");
      const num = Number(normalized);
      return Number.isNaN(num) ? NaN : num;
    })
    .refine(
      (value) =>
        value === undefined ||
        (!Number.isNaN(value) && value >= options.min && value <= options.max),
      `${options.field} должен быть от ${options.min} до ${options.max} ${options.unit}`,
    )
    .optional();
}

export function parsePetBirthDateInput(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/;
  const isoMatch = trimmed.match(iso);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    const date = new Date(y, m, d);
    if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) {
      return null;
    }
    return date;
  }

  const ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
  const ruMatch = trimmed.match(ru);
  if (ruMatch) {
    const day = parseInt(ruMatch[1], 10);
    const month = parseInt(ruMatch[2], 10) - 1;
    const year = parseInt(ruMatch[3], 10);
    const date = new Date(year, month, day);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
      return null;
    }
    return date;
  }

  return null;
}

export function formatIsoBirthDateToDdMmYyyy(value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") return "";
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return s;
}

export function validatePetBirthDateInput(
  raw: string,
): { ok: true; apiValue: string } | { ok: false; message: string } {
  const parsed = petBirthDateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Дата рождения заполнена некорректно",
    };
  }
  return { ok: true, apiValue: parsed.data };
}

export const petNameSchema = z
  .string()
  .trim()
  .min(2, "Имя должно содержать минимум 2 символа")
  .max(50, "Имя не может быть длиннее 50 символов")
  .regex(/^[а-яёА-ЯЁa-zA-Z\s-]+$/, "Имя может содержать только буквы, пробелы и дефис");

export const petTypeSchema = z.nativeEnum(PetType, {
  errorMap: () => ({ message: "Неверный тип питомца" }),
});

export const petBreedSchema = z
  .string()
  .trim()
  .min(2, "Порода должна содержать минимум 2 символа")
  .max(50, "Порода не может быть длиннее 50 символов");

export const petBirthDateSchema = z
  .string()
  .trim()
  .min(1, "Дата рождения обязательна")
  .refine((value) => parsePetBirthDateInput(value) !== null, {
    message: "Укажите дату как ДД.ММ.ГГГГ (например, 15.03.2020)",
  })
  .refine((value) => {
    const date = parsePetBirthDateInput(value)!;
    return date <= new Date();
  }, "Дата не может быть в будущем")
  .refine((value) => {
    const date = parsePetBirthDateInput(value)!;
    return date >= MIN_BIRTH_DATE;
  }, "Дата слишком старая")
  .transform((value) => {
    const date = parsePetBirthDateInput(value)!;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });

export const petHeightSchema = numericField({ min: 1, max: 200, field: "Рост", unit: "см" });
export const petWeightSchema = numericField({ min: 0.1, max: 200, field: "Вес", unit: "кг" });
export const petNeckGirthSchema = numericField({
  min: 1,
  max: 200,
  field: "Обхват шеи",
  unit: "см",
});
export const petMuzzleGirthSchema = numericField({
  min: 1,
  max: 200,
  field: "Обхват морды",
  unit: "см",
});
export const petBellyGirthSchema = numericField({
  min: 1,
  max: 200,
  field: "Обхват живота",
  unit: "см",
});

export const petNotesSchema = z
  .string()
  .trim()
  .max(500, "Заметки не могут быть длиннее 500 символов")
  .optional();

const basePetSchema = z.object({
  name: petNameSchema,
  type: petTypeSchema,
  breed: petBreedSchema,
  birthDate: petBirthDateSchema,
  heightCm: petHeightSchema,
  weightKg: petWeightSchema,
  neckGirthCm: petNeckGirthSchema,
  muzzleGirthCm: petMuzzleGirthSchema,
  bellyGirthCm: petBellyGirthSchema,
  photoUrl: optionalUrlSchema,
  notes: petNotesSchema,
});

export const createPetSchema = basePetSchema;
export const petFormSchema = basePetSchema.extend({
  id: z.string().trim().optional(),
});
export const updatePetSchema = basePetSchema.partial().extend({
  id: z.string().trim().min(1, "ID питомца обязателен"),
});
export const petIdSchema = z.string().trim().min(1, "ID питомца обязателен");

export type CreatePetSchema = z.infer<typeof createPetSchema>;
export type PetFormSchema = z.infer<typeof petFormSchema>;
export type UpdatePetSchema = z.infer<typeof updatePetSchema>;
