import { z } from "zod";

export const dailyCourseDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Дата должна быть в формате YYYY-MM-DD");

export const dailyCourseRangeSchema = z.object({
  from: dailyCourseDateSchema,
  to: dailyCourseDateSchema,
});

export const upsertDailyCourseScheduleSchema = z.object({
  date: dailyCourseDateSchema,
  bundleId: z.string().min(1, "bundleId обязателен"),
  isPublished: z.boolean().default(true),
});

export const deleteDailyCourseScheduleSchema = z.object({
  scheduleId: z.string().min(1, "scheduleId обязателен"),
});

export const upsertDailyCourseBundleSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1, "Название обязательно"),
  equipment: z.string().trim().optional().default(""),
  description: z.string().trim().optional().default(""),
  type: z.string().trim().min(1).default("daily_course"),
  stepIds: z.array(z.string().min(1)).min(2).max(5),
});

export const deleteDailyCourseBundleSchema = z.object({
  bundleId: z.string().min(1, "bundleId обязателен"),
});

export type DailyCourseRangeInput = z.infer<typeof dailyCourseRangeSchema>;
export type UpsertDailyCourseScheduleInput = z.infer<typeof upsertDailyCourseScheduleSchema>;
export type DeleteDailyCourseScheduleInput = z.infer<typeof deleteDailyCourseScheduleSchema>;
export type UpsertDailyCourseBundleInput = z.infer<typeof upsertDailyCourseBundleSchema>;
export type DeleteDailyCourseBundleInput = z.infer<typeof deleteDailyCourseBundleSchema>;
