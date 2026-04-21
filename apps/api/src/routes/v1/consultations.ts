/**
 * Консультации с кинологом (mobile + паритет с web Route Handlers).
 */
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
  bookSlot,
  bookSlotInputSchema,
  cancelBookingBodySchema,
  cancelBookingByUser,
  confirmBookingByTrainer,
  cursorPaginationSchema,
  dayOffInputSchema,
  getAvailableSlots,
  getSlotsQuerySchema,
  getTrainerAvailability,
  listAdminBookings,
  listAllTrainersForAdmin,
  listClientBookings,
  listListedCynologists,
  listTrainerBookings,
  rejectBookingByTrainer,
  removeDayOff,
  removeSlotException,
  setTrainerAvailability,
  slotExceptionInputSchema,
  trainerAvailabilityInputSchema,
} from "@gafus/core/services/consultation";
import { createWebLogger } from "@gafus/logger";

import { requireRole } from "../../middleware/auth.js";
import { consultationBookRateLimiter } from "../../middleware/rate-limit.js";

const logger = createWebLogger("api-consultations");

export const consultationsRoutes = new Hono();

function handleConsultationError(c: import("hono").Context, error: unknown) {
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
  logger.error("consultations route", error as Error);
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

consultationsRoutes.get("/cynologists/:cynologistUserId/slots", zValidator("query", getSlotsQuerySchema), async (c) => {
  try {
    const { cynologistUserId } = c.req.param();
    const q = c.req.valid("query");
    const data = await getAvailableSlots(
      cynologistUserId,
      new Date(q.from),
      new Date(q.to),
    );
    return c.json({ success: true, data });
  } catch (error) {
    return handleConsultationError(c, error);
  }
});

consultationsRoutes.post("/book", consultationBookRateLimiter, zValidator("json", bookSlotInputSchema), async (c) => {
  try {
    const user = c.get("user");
    const body = c.req.valid("json");
    const requestId = c.req.header("X-Request-Id") ?? undefined;
    const result = await bookSlot(user.id, body, requestId);
    const status = result.kind === "created" ? 201 : 200;
    return c.json({ success: true, data: result }, status);
  } catch (error) {
    return handleConsultationError(c, error);
  }
});

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
  "/trainer/bookings/:bookingId/reject",
  requireRole("TRAINER", "ADMIN", "MODERATOR"),
  zValidator(
    "json",
    z.object({ reason: z.string().max(500).optional() }),
  ),
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

consultationsRoutes.get("/trainer/availability", requireRole("TRAINER", "ADMIN", "MODERATOR"), async (c) => {
  try {
    const user = c.get("user");
    const data = await getTrainerAvailability(user.id);
    return c.json({ success: true, data });
  } catch (error) {
    return handleConsultationError(c, error);
  }
});

consultationsRoutes.put(
  "/trainer/availability",
  requireRole("TRAINER", "ADMIN", "MODERATOR"),
  zValidator("json", trainerAvailabilityInputSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const body = c.req.valid("json");
      await setTrainerAvailability(user.id, body);
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
      const user = c.get("user");
      const body = c.req.valid("json");
      await addDayOff(user.id, body.date, body.reason);
      return c.json({ success: true, data: {} });
    } catch (error) {
      return handleConsultationError(c, error);
    }
  },
);

consultationsRoutes.delete("/trainer/day-offs/:dayOffId", requireRole("TRAINER", "ADMIN", "MODERATOR"), async (c) => {
  try {
    const user = c.get("user");
    const dayOffId = c.req.param("dayOffId");
    await removeDayOff(user.id, dayOffId);
    return c.json({ success: true, data: {} });
  } catch (error) {
    return handleConsultationError(c, error);
  }
});

consultationsRoutes.post(
  "/trainer/exceptions",
  requireRole("TRAINER", "ADMIN", "MODERATOR"),
  zValidator("json", slotExceptionInputSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const body = c.req.valid("json");
      await addSlotException(
        user.id,
        new Date(body.startAt),
        new Date(body.endAt),
        body.reason,
      );
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
      const user = c.get("user");
      const exceptionId = c.req.param("exceptionId");
      await removeSlotException(user.id, exceptionId);
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
