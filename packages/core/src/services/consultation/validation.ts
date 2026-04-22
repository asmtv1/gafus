import { z } from "zod";

/** Литералы Prisma enum — не `z.nativeEnum` из @gafus/prisma: в server-бандлах Next именованные экспорты Prisma-enum иногда undefined. */
const CONSULTATION_SLOT_STATUS = ["FREE", "BOOKED", "BLOCKED"] as const;
const CONSULTATION_BOOKING_STATUS = [
  "PENDING_TRAINER_CONFIRMATION",
  "CONFIRMED",
  "CANCELLED_BY_TRAINER",
  "CANCELLED_BY_USER",
  "CANCELLED_BY_SLA",
  "CANCELLED_BY_SYSTEM",
  "COMPLETED",
  "NO_SHOW",
] as const;

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const uuidV4 = z.string().uuid("Нужен Idempotency-Key (UUID в заголовке или теле)");

/** ISO-строки from/to; верхняя граница длины — защита от чрезмерного ввода в query. */
export const getSlotsQuerySchema = z.object({
  from: z.string().min(1).max(64),
  to: z.string().min(1).max(64),
  /** «1» — календарь со всеми статусами слотов (как web с includeBusy). */
  includeBusy: z.enum(["0", "1"]).optional(),
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

/** Id в Prisma — cuid/uuid-строки; не привязываемся к одному формату. */
const consultationEntityIdSchema = z.string().min(1).max(128);

/** Валидация JSON при replay идемпотентности брони (защита от подмены записи в БД). */
const consultationSlotDtoSchema = z.object({
  id: consultationEntityIdSchema,
  startAtUtc: z.string().min(1),
  endAtUtc: z.string().min(1),
  status: z.enum(CONSULTATION_SLOT_STATUS),
});

const consultationBookingDtoSchema = z.object({
  id: consultationEntityIdSchema,
  status: z.enum(CONSULTATION_BOOKING_STATUS),
  slot: consultationSlotDtoSchema,
  cynologistUserId: z.string().min(1),
  cynologistDisplayName: z.string().nullable(),
  clientProblem: z.string().nullable(),
  cancelReason: z.string().nullable(),
  joinUrl: z.string().nullable(),
  watchUrl: z.string().nullable(),
  confirmationDeadlineAt: z.string().min(1),
  createdAt: z.string().min(1),
});

export const bookSlotResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("created"), booking: consultationBookingDtoSchema }),
  z.object({ kind: z.literal("idempotent_replay"), booking: consultationBookingDtoSchema }),
]);

export type GetSlotsQuery = z.infer<typeof getSlotsQuerySchema>;
export type BookSlotInput = z.infer<typeof bookSlotInputSchema>;
export type TrainerAvailabilityInput = z.infer<typeof trainerAvailabilityInputSchema>;
export type AdminListedCynologistsInput = z.infer<typeof adminListedCynologistsInputSchema>;
