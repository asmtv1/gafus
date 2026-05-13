"use server";

import type { AuthRole } from "@gafus/auth";
import { authOptions } from "@gafus/auth";
import {
  completeBookingByTrainer,
  confirmBookingByTrainer,
  ConsultationForbiddenError,
  ConsultationNotFoundError,
  markBookingNoShowByTrainer,
  rejectBookingByTrainer,
} from "@gafus/core";
import { createTrainerPanelLogger } from "@gafus/logger";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

const logger = createTrainerPanelLogger("consultations-trainer-actions");

const TRAINER_ROLES = new Set<AuthRole>(["TRAINER", "ADMIN", "MODERATOR"]);

export type BookingActionResult = { success: true } | { success: false; error: string };

async function requireTrainerSession(): Promise<
  | { ok: true; userId: string; role: AuthRole }
  | { ok: false; error: string }
> {
  const session = (await getServerSession(authOptions)) as {
    user: { id: string; role: string };
  } | null;
  if (!session?.user?.id) {
    return { ok: false, error: "Не авторизован" };
  }
  const role = session.user.role as AuthRole;
  if (!TRAINER_ROLES.has(role)) {
    return { ok: false, error: "Недостаточно прав" };
  }
  return { ok: true, userId: session.user.id, role };
}

export async function confirmBookingTrainerAction(bookingId: string): Promise<BookingActionResult> {
  try {
    const s = await requireTrainerSession();
    if (!s.ok) {
      return { success: false, error: s.error };
    }
    await confirmBookingByTrainer(s.userId, s.role, bookingId);
    revalidatePath("/main-panel/consultations");
    return { success: true };
  } catch (error) {
    if (error instanceof ConsultationForbiddenError || error instanceof ConsultationNotFoundError) {
      return { success: false, error: error.message };
    }
    logger.error(
      "confirmBooking",
      error instanceof Error ? error : new Error(String(error)),
      { bookingId },
    );
    return { success: false, error: "Не удалось подтвердить" };
  }
}

export async function rejectBookingTrainerAction(
  bookingId: string,
  reason?: string,
): Promise<BookingActionResult> {
  try {
    const s = await requireTrainerSession();
    if (!s.ok) {
      return { success: false, error: s.error };
    }
    await rejectBookingByTrainer(s.userId, s.role, bookingId, reason);
    revalidatePath("/main-panel/consultations");
    return { success: true };
  } catch (error) {
    if (error instanceof ConsultationForbiddenError || error instanceof ConsultationNotFoundError) {
      return { success: false, error: error.message };
    }
    logger.error(
      "rejectBooking",
      error instanceof Error ? error : new Error(String(error)),
      { bookingId },
    );
    return { success: false, error: "Не удалось отклонить" };
  }
}

export async function completeBookingTrainerAction(bookingId: string): Promise<BookingActionResult> {
  try {
    const s = await requireTrainerSession();
    if (!s.ok) {
      return { success: false, error: s.error };
    }
    await completeBookingByTrainer(s.userId, s.role, bookingId);
    revalidatePath("/main-panel/consultations");
    return { success: true };
  } catch (error) {
    if (error instanceof ConsultationForbiddenError || error instanceof ConsultationNotFoundError) {
      return { success: false, error: error.message };
    }
    logger.error(
      "completeBooking",
      error instanceof Error ? error : new Error(String(error)),
      { bookingId },
    );
    return { success: false, error: "Не удалось завершить консультацию" };
  }
}

export async function markNoShowBookingTrainerAction(bookingId: string): Promise<BookingActionResult> {
  try {
    const s = await requireTrainerSession();
    if (!s.ok) {
      return { success: false, error: s.error };
    }
    await markBookingNoShowByTrainer(s.userId, s.role, bookingId);
    revalidatePath("/main-panel/consultations");
    return { success: true };
  } catch (error) {
    if (error instanceof ConsultationForbiddenError || error instanceof ConsultationNotFoundError) {
      return { success: false, error: error.message };
    }
    logger.error(
      "markNoShowBooking",
      error instanceof Error ? error : new Error(String(error)),
      { bookingId },
    );
    return { success: false, error: "Не удалось выставить неявку" };
  }
}
