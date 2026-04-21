"use server";

import type { AuthRole } from "@gafus/auth";
import { authOptions } from "@gafus/auth";
import {
  addDayOff,
  addSlotException,
  removeDayOff,
  removeSlotException,
  setTrainerAvailability,
  trainerAvailabilityInputSchema,
} from "@gafus/core";
import { createTrainerPanelLogger } from "@gafus/logger";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const logger = createTrainerPanelLogger("consultations-availability");

const TRAINER_ROLES = new Set<AuthRole>(["TRAINER", "ADMIN", "MODERATOR"]);

async function requireTrainerSession(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = (await getServerSession(authOptions)) as {
    user: { id: string; role: string };
  } | null;
  if (!session?.user?.id) {
    return { ok: false, error: "Не авторизован" };
  }
  if (!TRAINER_ROLES.has(session.user.role as AuthRole)) {
    return { ok: false, error: "Недостаточно прав" };
  }
  return { ok: true, userId: session.user.id };
}

export type ActionOk = { success: true } | { success: false; error: string };

export async function saveTrainerAvailabilityAction(
  raw: unknown,
): Promise<ActionOk> {
  try {
    const s = await requireTrainerSession();
    if (!s.ok) {
      return { success: false, error: s.error };
    }
    const body = trainerAvailabilityInputSchema.parse(raw);
    await setTrainerAvailability(s.userId, body);
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

export async function addDayOffAction(date: string): Promise<ActionOk> {
  try {
    const s = await requireTrainerSession();
    if (!s.ok) {
      return { success: false, error: s.error };
    }
    await addDayOff(s.userId, date);
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

export async function removeDayOffAction(dayOffId: string): Promise<ActionOk> {
  try {
    const s = await requireTrainerSession();
    if (!s.ok) {
      return { success: false, error: s.error };
    }
    await removeDayOff(s.userId, dayOffId);
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
  startAt: string,
  endAt: string,
): Promise<ActionOk> {
  try {
    const s = await requireTrainerSession();
    if (!s.ok) {
      return { success: false, error: s.error };
    }
    await addSlotException(s.userId, new Date(startAt), new Date(endAt));
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

export async function removeSlotExceptionAction(exceptionId: string): Promise<ActionOk> {
  try {
    const s = await requireTrainerSession();
    if (!s.ok) {
      return { success: false, error: s.error };
    }
    await removeSlotException(s.userId, exceptionId);
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
