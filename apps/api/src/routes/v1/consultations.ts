/**
 * Консультации с кинологом (mobile + паритет с web Route Handlers).
 */
import type { AuthRole } from "@gafus/auth";
import type { Context } from "hono";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import {
  ConsultationForbiddenError,
  ConsultationNotFoundError,
  ConsultationSlotTakenError,
  TelemostUnavailableError,
  adminListedCynologistsInputSchema,
  adminSetListedCynologists,
  addDayOff,
  addSlotException,
  bookSlotWithSubscription,
  bookSlotInputSchema,
  cancelBookingBodySchema,
  cancelBookingByUser,
  completeBookingByTrainer,
  confirmBookingByTrainer,
  cursorPaginationSchema,
  dayOffInputSchema,
  getAvailableSlots,
  getCalendarSlots,
  getCynologistDayOffDates,
  getSlotsQuerySchema,
  getTrainerAvailability,
  requireConsultationSlotsSubscriptionAccess,
  listAdminBookings,
  listAllTrainersForAdmin,
  listClientBookings,
  listListedCynologists,
  listTrainerBookings,
  markBookingNoShowByTrainer,
  rejectBookingByTrainer,
  removeDayOff,
  removeSlotException,
  resolveTargetTrainerUserIdForStaff,
  setTrainerAvailability,
  slotExceptionInputSchema,
  verifyConsultationSlotFreeForCynologist,
  trainerAvailabilityInputSchema,
} from "@gafus/core/services/consultation";
import { SubscriptionRequiredError } from "@gafus/core/services/appSubscription";
import { createWebLogger, isZodErrorLike, sanitizeZodErrorForLogMeta } from "@gafus/logger";

import { requireRole } from "../../middleware/auth.js";
import { consultationBookRateLimiter } from "../../middleware/rate-limit.js";

const logger = createWebLogger("api-consultations");

export const consultationsRoutes = new Hono();

async function targetTrainerIdFromRequest(c: Context): Promise<string> {
  const user = c.get("user");
  const q = c.req.query("trainerUserId");
  return resolveTargetTrainerUserIdForStaff(
    { id: user.id, role: user.role as AuthRole },
    q ?? undefined,
  );
}

function handleConsultationError(c: import("hono").Context, error: unknown) {
  if (error instanceof SubscriptionRequiredError) {
    return c.json(
      {
        success: false,
        error: error.message,
        code: "SUBSCRIPTION_REQUIRED",
      },
      402,
    );
  }
  if (error instanceof ConsultationSlotTakenError) {
    return c.json({ success: false, error: error.message, code: error.code }, 409);
  }
  if (error instanceof ConsultationForbiddenError) {
    return c.json({ success: false, error: error.message, code: error.code }, 403);
  }
  if (error instanceof ConsultationNotFoundError) {
    return c.json({ success: false, error: error.message, code: error.code }, 404);
  }
  if (error instanceof TelemostUnavailableError) {
    return c.json({ success: false, error: error.message, code: error.code }, 503);
  }
  if (isZodErrorLike(error)) {
    logger.error("consultations route", undefined, sanitizeZodErrorForLogMeta(error));
  } else {
    logger.error("consultations route", error instanceof Error ? error : new Error(String(error)));
  }
  return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
}

consultationsRoutes.get("/cynologists", async (c) => {
  try {
    const data = await listListedCynologists();
    return c.json({ success: true, data });
  } catch (error) {
    return handleConsultationError(c, error);
  }
});

consultationsRoutes.get("/cynologists/:cynologistUserId/slots/:slotId/verify", async (c) => {
  try {
    const user = c.get("user");
    const { cynologistUserId, slotId } = c.req.param();
    await requireConsultationSlotsSubscriptionAccess({
      userId: user.id,
    });
    await verifyConsultationSlotFreeForCynologist(slotId, cynologistUserId);
    return c.json({ success: true });
  } catch (error) {
    return handleConsultationError(c, error);
  }
});

consultationsRoutes.get(
  "/cynologists/:cynologistUserId/slots",
  zValidator("query", getSlotsQuerySchema),
  async (c) => {
    try {
      const { cynologistUserId } = c.req.param();
      const q = c.req.valid("query");
      const from = new Date(q.from);
      const to = new Date(q.to);
      const includeBusy = q.includeBusy === "1";
      const data = includeBusy
        ? await getCalendarSlots(cynologistUserId, from, to)
        : await getAvailableSlots(cynologistUserId, from, to);
      if (includeBusy) {
        const dayOffDates = await getCynologistDayOffDates(cynologistUserId, from, to);
        return c.json({ success: true, data, dayOffDates });
      }
      return c.json({ success: true, data });
    } catch (error) {
      return handleConsultationError(c, error);
    }
  },
);

consultationsRoutes.post(
  "/book",
  consultationBookRateLimiter,
  zValidator("json", bookSlotInputSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const body = c.req.valid("json");
      const requestId = c.req.header("X-Request-Id") ?? undefined;
      const result = await bookSlotWithSubscription({
        userId: user.id,
        body,
        requestId,
      });
      const status = result.kind === "created" ? 201 : 200;
      return c.json({ success: true, data: result }, status);
    } catch (error) {
      return handleConsultationError(c, error);
    }
  },
);

consultationsRoutes.get("/my", zValidator("query", cursorPaginationSchema), async (c) => {
  try {
    const user = c.get("user");
    const q = c.req.valid("query");
    const data = await listClientBookings(user.id, q.cursor, q.limit);
    return c.json({ success: true, data });
  } catch (error) {
    return handleConsultationError(c, error);
  }
});

consultationsRoutes.post(
  "/bookings/:bookingId/cancel",
  zValidator("json", cancelBookingBodySchema.optional()),
  async (c) => {
    try {
      const user = c.get("user");
      const bookingId = c.req.param("bookingId");
      await cancelBookingByUser(user.id, bookingId);
      return c.json({ success: true, data: { bookingId } });
    } catch (error) {
      return handleConsultationError(c, error);
    }
  },
);

consultationsRoutes.get(
  "/trainer/bookings",
  requireRole("TRAINER", "ADMIN", "MODERATOR"),
  async (c) => {
    try {
      const user = c.get("user");
      const data = await listTrainerBookings(user.id, user.role);
      return c.json({ success: true, data });
    } catch (error) {
      return handleConsultationError(c, error);
    }
  },
);

consultationsRoutes.post(
  "/trainer/bookings/:bookingId/confirm",
  requireRole("TRAINER", "ADMIN", "MODERATOR"),
  async (c) => {
    try {
      const user = c.get("user");
      const bookingId = c.req.param("bookingId");
      await confirmBookingByTrainer(user.id, user.role, bookingId);
      return c.json({ success: true, data: { bookingId } });
    } catch (error) {
      return handleConsultationError(c, error);
    }
  },
);

consultationsRoutes.post(
  "/trainer/bookings/:bookingId/complete",
  requireRole("TRAINER", "ADMIN", "MODERATOR"),
  async (c) => {
    try {
      const user = c.get("user");
      const bookingId = c.req.param("bookingId");
      await completeBookingByTrainer(user.id, user.role, bookingId);
      return c.json({ success: true, data: { bookingId } });
    } catch (error) {
      return handleConsultationError(c, error);
    }
  },
);

consultationsRoutes.post(
  "/trainer/bookings/:bookingId/no-show",
  requireRole("TRAINER", "ADMIN", "MODERATOR"),
  async (c) => {
    try {
      const user = c.get("user");
      const bookingId = c.req.param("bookingId");
      await markBookingNoShowByTrainer(user.id, user.role, bookingId);
      return c.json({ success: true, data: { bookingId } });
    } catch (error) {
      return handleConsultationError(c, error);
    }
  },
);

consultationsRoutes.post(
  "/trainer/bookings/:bookingId/reject",
  requireRole("TRAINER", "ADMIN", "MODERATOR"),
  zValidator("json", z.object({ reason: z.string().max(500).optional() })),
  async (c) => {
    try {
      const user = c.get("user");
      const bookingId = c.req.param("bookingId");
      const body = c.req.valid("json");
      await rejectBookingByTrainer(user.id, user.role, bookingId, body?.reason);
      return c.json({ success: true, data: { bookingId } });
    } catch (error) {
      return handleConsultationError(c, error);
    }
  },
);

consultationsRoutes.get(
  "/trainer/availability",
  requireRole("TRAINER", "ADMIN", "MODERATOR"),
  async (c) => {
    try {
      const targetId = await targetTrainerIdFromRequest(c);
      const data = await getTrainerAvailability(targetId);
      return c.json({ success: true, data });
    } catch (error) {
      return handleConsultationError(c, error);
    }
  },
);

consultationsRoutes.put(
  "/trainer/availability",
  requireRole("TRAINER", "ADMIN", "MODERATOR"),
  zValidator("json", trainerAvailabilityInputSchema),
  async (c) => {
    try {
      const targetId = await targetTrainerIdFromRequest(c);
      const body = c.req.valid("json");
      await setTrainerAvailability(targetId, body);
      return c.json({ success: true, data: {} });
    } catch (error) {
      return handleConsultationError(c, error);
    }
  },
);

consultationsRoutes.post(
  "/trainer/day-offs",
  requireRole("TRAINER", "ADMIN", "MODERATOR"),
  zValidator("json", dayOffInputSchema),
  async (c) => {
    try {
      const targetId = await targetTrainerIdFromRequest(c);
      const body = c.req.valid("json");
      await addDayOff(targetId, body.date, body.reason);
      return c.json({ success: true, data: {} });
    } catch (error) {
      return handleConsultationError(c, error);
    }
  },
);

consultationsRoutes.delete(
  "/trainer/day-offs/:dayOffId",
  requireRole("TRAINER", "ADMIN", "MODERATOR"),
  async (c) => {
    try {
      const targetId = await targetTrainerIdFromRequest(c);
      const dayOffId = c.req.param("dayOffId");
      await removeDayOff(targetId, dayOffId);
      return c.json({ success: true, data: {} });
    } catch (error) {
      return handleConsultationError(c, error);
    }
  },
);

consultationsRoutes.post(
  "/trainer/exceptions",
  requireRole("TRAINER", "ADMIN", "MODERATOR"),
  zValidator("json", slotExceptionInputSchema),
  async (c) => {
    try {
      const targetId = await targetTrainerIdFromRequest(c);
      const body = c.req.valid("json");
      await addSlotException(targetId, new Date(body.startAt), new Date(body.endAt), body.reason);
      return c.json({ success: true, data: {} });
    } catch (error) {
      return handleConsultationError(c, error);
    }
  },
);

consultationsRoutes.delete(
  "/trainer/exceptions/:exceptionId",
  requireRole("TRAINER", "ADMIN", "MODERATOR"),
  async (c) => {
    try {
      const targetId = await targetTrainerIdFromRequest(c);
      const exceptionId = c.req.param("exceptionId");
      await removeSlotException(targetId, exceptionId);
      return c.json({ success: true, data: {} });
    } catch (error) {
      return handleConsultationError(c, error);
    }
  },
);

consultationsRoutes.get("/admin/cynologists", requireRole("ADMIN", "MODERATOR"), async (c) => {
  try {
    const data = await listAllTrainersForAdmin();
    return c.json({ success: true, data });
  } catch (error) {
    return handleConsultationError(c, error);
  }
});

consultationsRoutes.put(
  "/admin/cynologists/listed",
  requireRole("ADMIN", "MODERATOR"),
  zValidator("json", adminListedCynologistsInputSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const body = c.req.valid("json");
      await adminSetListedCynologists(user.id, user.role, body.cynologistUserIds);
      return c.json({ success: true, data: {} });
    } catch (error) {
      return handleConsultationError(c, error);
    }
  },
);

consultationsRoutes.get("/admin/bookings", requireRole("ADMIN", "MODERATOR"), async (c) => {
  try {
    const data = await listAdminBookings();
    return c.json({ success: true, data });
  } catch (error) {
    return handleConsultationError(c, error);
  }
});
