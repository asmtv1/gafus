import { z } from "zod";

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const uuidV4 = z.string().uuid("Нужен Idempotency-Key (UUID в заголовке или теле)");

export const getSlotsQuerySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
}).refine(
  (d) => {
    const a = new Date(d.from).getTime();
    const b = new Date(d.to).getTime();
    return !Number.isNaN(a) && !Number.isNaN(b) && b >= a && b - a <= 60 * 24 * 60 * 60 * 1000;
  },
  { message: "Интервал не более 60 дней и from ≤ to", path: ["to"] },
);

export const bookSlotInputSchema = z.object({
  slotId: z.string().min(1),
  idempotencyKey: uuidV4,
  clientProblem: z.string().trim().max(1500).optional(),
});

export const trainerConfirmInputSchema = z.object({
  bookingId: z.string().min(1),
});

export const trainerRejectInputSchema = z.object({
  bookingId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export const cancelBookingInputSchema = z.object({
  bookingId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

/** Тело POST отмены, когда bookingId в path. */
export const cancelBookingBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

const availabilityRuleRowSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(HH_MM, "Время начала HH:MM"),
  endTime: z.string().regex(HH_MM, "Время окончания HH:MM"),
  isWorkingDay: z.boolean().default(true),
}).refine(
  (r) => {
    const [sh, sm] = r.startTime.split(":").map(Number);
    const [eh, em] = r.endTime.split(":").map(Number);
    return eh * 60 + em > sh * 60 + sm;
  },
  { message: "Конец интервала должен быть позже начала", path: ["endTime"] },
);

export const trainerAvailabilityInputSchema = z.object({
  rules: z.array(availabilityRuleRowSchema).min(1),
});

export const dayOffInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата YYYY-MM-DD"),
  reason: z.string().max(500).optional(),
});

export const slotExceptionInputSchema = z.object({
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  reason: z.string().max(500).optional(),
}).refine(
  (d) => new Date(d.endAt).getTime() > new Date(d.startAt).getTime(),
  { message: "endAt должен быть позже startAt", path: ["endAt"] },
);

export const adminListedCynologistsInputSchema = z.object({
  cynologistUserIds: z.array(z.string().min(1)),
});

export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export type GetSlotsQuery = z.infer<typeof getSlotsQuerySchema>;
export type BookSlotInput = z.infer<typeof bookSlotInputSchema>;
export type TrainerAvailabilityInput = z.infer<typeof trainerAvailabilityInputSchema>;
export type AdminListedCynologistsInput = z.infer<typeof adminListedCynologistsInputSchema>;
