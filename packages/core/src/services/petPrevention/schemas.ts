/**
 * Zod-схемы для валидации записей журнала профилактики питомца
 */
import { z } from "zod";

export const petPreventionTypeSchema = z.enum(["VACCINATION", "DEWORMING", "TICKS_FLEAS"]);

export const petPreventionReminderKindSchema = z.enum(["AFTER_DAYS", "ON_DATE"]);

const reminderFields = {
  reminderEnabled: z.boolean().default(true),
  reminderKind: petPreventionReminderKindSchema.default("AFTER_DAYS"),
  reminderDaysAfter: z.number().int().min(1).max(1095).optional().nullable(),
  reminderOnDate: z.coerce.date().optional().nullable(),
};

const entryBodySchema = z.object({
  type: petPreventionTypeSchema,
  performedAt: z.coerce.date(),
  productName: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  ...reminderFields,
});

export const createEntrySchema = entryBodySchema.superRefine((data, ctx) => {
  if (!data.reminderEnabled) {
    return;
  }
  if (data.reminderKind === "ON_DATE" && data.reminderOnDate == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Укажите дату напоминания",
      path: ["reminderOnDate"],
    });
  }
});

/** Частичное обновление: валидация комбинации полей — в сервисе после merge с существующей записью. */
export const updateEntrySchema = entryBodySchema.partial();

export const batchEntrySchema = z.object({
  clientId: z.string().uuid(),
  type: petPreventionTypeSchema,
  performedAt: z.coerce.date(),
  productName: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  reminderEnabled: z.boolean().optional(),
  reminderKind: petPreventionReminderKindSchema.optional(),
  reminderDaysAfter: z.number().int().min(1).max(1095).optional().nullable(),
  reminderOnDate: z.coerce.date().optional().nullable(),
});

export const batchRequestSchema = z.object({
  entries: z.array(batchEntrySchema).min(1).max(50),
});

export type CreateEntryInput = z.infer<typeof createEntrySchema>;
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;
export type BatchEntryInput = z.infer<typeof batchEntrySchema>;
