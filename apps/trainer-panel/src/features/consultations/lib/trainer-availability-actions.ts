"use server";

import type { AuthRole } from "@gafus/auth";
import { authOptions } from "@gafus/auth";
import {
  addDayOff,
  addSlotException,
  removeDayOff,
  removeSlotException,
  setTrainerAvailability,
} from "@gafus/core/services/consultation/availabilityService";
import { resolveTargetTrainerUserIdForStaff } from "@gafus/core/services/consultation/cynologistService";
import { ConsultationForbiddenError } from "@gafus/core/services/consultation/errors";
import { trainerAvailabilityInputSchema } from "@gafus/core/services/consultation/validation";
import { createTrainerPanelLogger } from "@gafus/logger";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const logger = createTrainerPanelLogger("consultations-availability");

export type ActionOk = { success: true } | { success: false; error: string };

async function requireStaffManagingTrainer(trainerUserId: string): Promise<
  { ok: true; targetTrainerUserId: string } | { ok: false; error: string }
> {
  const session = (await getServerSession(authOptions)) as {
    user: { id: string; role: string };
  } | null;
  if (!session?.user?.id) {
    return { ok: false, error: "Не авторизован" };
  }
  try {
    const target = await resolveTargetTrainerUserIdForStaff(
      { id: session.user.id, role: session.user.role as AuthRole },
      trainerUserId,
    );
    return { ok: true, targetTrainerUserId: target };
  } catch (e) {
    if (e instanceof ConsultationForbiddenError) {
      return { ok: false, error: e.message || "Недостаточно прав" };
    }
    throw e;
  }
}

export async function saveTrainerAvailabilityAction(
  trainerUserId: string,
  raw: unknown,
): Promise<ActionOk> {
  try {
    const s = await requireStaffManagingTrainer(trainerUserId);
    if (!s.ok) {
      return { success: false, error: s.error };
    }
    const body = trainerAvailabilityInputSchema.parse(raw);
    await setTrainerAvailability(s.targetTrainerUserId, body);
    revalidatePath("/main-panel/consultations/availability");
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message ?? "Ошибка валидации" };
    }
    logger.error(
      "saveTrainerAvailability",
      error instanceof Error ? error : new Error(String(error)),
    );
    return { success: false, error: "Не удалось сохранить расписание" };
  }
}

export async function addDayOffAction(trainerUserId: string, date: string): Promise<ActionOk> {
  try {
    const s = await requireStaffManagingTrainer(trainerUserId);
    if (!s.ok) {
      return { success: false, error: s.error };
    }
    await addDayOff(s.targetTrainerUserId, date);
    revalidatePath("/main-panel/consultations/availability");
    return { success: true };
  } catch (error) {
    logger.error(
      "addDayOff",
      error instanceof Error ? error : new Error(String(error)),
    );
    return { success: false, error: "Не удалось добавить выходной" };
  }
}

export async function removeDayOffAction(trainerUserId: string, dayOffId: string): Promise<ActionOk> {
  try {
    const s = await requireStaffManagingTrainer(trainerUserId);
    if (!s.ok) {
      return { success: false, error: s.error };
    }
    await removeDayOff(s.targetTrainerUserId, dayOffId);
    revalidatePath("/main-panel/consultations/availability");
    return { success: true };
  } catch (error) {
    logger.error(
      "removeDayOff",
      error instanceof Error ? error : new Error(String(error)),
    );
    return { success: false, error: "Не удалось удалить выходной" };
  }
}

export async function addSlotExceptionAction(
  trainerUserId: string,
  startAt: string,
  endAt: string,
): Promise<ActionOk> {
  try {
    const s = await requireStaffManagingTrainer(trainerUserId);
    if (!s.ok) {
      return { success: false, error: s.error };
    }
    await addSlotException(s.targetTrainerUserId, new Date(startAt), new Date(endAt));
    revalidatePath("/main-panel/consultations/availability");
    return { success: true };
  } catch (error) {
    logger.error(
      "addSlotException",
      error instanceof Error ? error : new Error(String(error)),
    );
    return { success: false, error: "Не удалось добавить исключение" };
  }
}

export async function removeSlotExceptionAction(
  trainerUserId: string,
  exceptionId: string,
): Promise<ActionOk> {
  try {
    const s = await requireStaffManagingTrainer(trainerUserId);
    if (!s.ok) {
      return { success: false, error: s.error };
    }
    await removeSlotException(s.targetTrainerUserId, exceptionId);
    revalidatePath("/main-panel/consultations/availability");
    return { success: true };
  } catch (error) {
    logger.error(
      "removeSlotException",
      error instanceof Error ? error : new Error(String(error)),
    );
    return { success: false, error: "Не удалось удалить исключение" };
  }
}
