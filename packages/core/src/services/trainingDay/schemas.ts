/**
 * Zod-схемы для сервиса тренировочных дней (core).
 */

import { z } from "zod";

export const createTrainingDaySchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  type: z.string().default("regular"),
  equipment: z.string().default(""),
  showCoursePathExport: z.boolean().default(false),
  stepIds: z.array(z.string().min(1)),
  authorId: z.string().min(1),
});

export const updateTrainingDaySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  type: z.string().default("regular"),
  equipment: z.string().default(""),
  showCoursePathExport: z.boolean().default(false),
  stepIds: z.array(z.string().min(1)),
});

export const deleteDaysSchema = z.object({
  dayIds: z.array(z.string().min(1)).min(1, "Укажите дни для удаления"),
});

export type CreateTrainingDayInput = z.infer<typeof createTrainingDaySchema>;
export type UpdateTrainingDayInput = z.infer<typeof updateTrainingDaySchema>;
export type DeleteDaysInput = z.infer<typeof deleteDaysSchema>;
