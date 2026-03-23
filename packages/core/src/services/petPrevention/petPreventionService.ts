/**
 * Сервис журнала профилактики питомца (прививки, глистогонка, клещи/блохи)
 */
import { ZodError } from "zod";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import {
  handlePrismaError,
  NotFoundError,
  ServiceError,
  ValidationError,
} from "@gafus/core/errors";

import {
  batchRequestSchema,
  createEntrySchema,
  updateEntrySchema,
  type BatchEntryInput,
  type CreateEntryInput,
} from "./schemas";
import {
  computeReminderFields,
  DEFAULT_REMINDER_DAYS,
  type PetPreventionTypeKey,
  utcDayStart,
} from "./reminderCompute";

const logger = createWebLogger("pet-prevention");

/** Сообщение клиенту при ошибке Zod (детали только в логах) */
const USER_MSG_VALIDATION = "Неверные данные";
const USER_MSG_CREATE_FAILED = "Не удалось создать запись";
const USER_MSG_UPDATE_FAILED = "Не удалось обновить запись";
const USER_MSG_DELETE_FAILED = "Не удалось удалить запись";
const USER_MSG_LOAD_FAILED = "Не удалось загрузить записи";
const USER_MSG_BATCH_FAILED = "Не удалось синхронизировать записи";
/** Нейтральный текст вместо сообщения NotFoundError с контекстом БД */
const USER_MSG_RECORD_NOT_FOUND = "Запись не найдена";

function logPetPreventionFailure(
  label: string,
  error: unknown,
  context: Record<string, unknown>,
): void {
  if (error instanceof ZodError) {
    logger.error(label, error, { ...context, zodFlatten: error.flatten() });
    return;
  }
  if (error instanceof ServiceError) {
    logger.error(label, error, {
      ...context,
      serviceCode: error.code,
      serviceMessage: error.message,
    });
    return;
  }
  logger.error(label, error as Error, context);
}

/** Клиенту не отдаём message из Prisma/ServiceError (поля, коды P*) */
function mapServiceErrorToUserMessage(
  serviceError: unknown,
  operationFallback: string,
): string {
  if (serviceError instanceof ValidationError) {
    return USER_MSG_VALIDATION;
  }
  if (serviceError instanceof NotFoundError) {
    return USER_MSG_RECORD_NOT_FOUND;
  }
  return operationFallback;
}

const SELECT_ENTRY = {
  id: true,
  type: true,
  performedAt: true,
  productName: true,
  notes: true,
  clientId: true,
  reminderEnabled: true,
  reminderKind: true,
  reminderDaysAfter: true,
  reminderOnDate: true,
  remindAt: true,
  lastNotifiedForRemindAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type EntrySelect = {
  id: string;
  type: string;
  performedAt: Date;
  productName: string | null;
  notes: string | null;
  clientId: string | null;
  reminderEnabled: boolean;
  reminderKind: string;
  reminderDaysAfter: number | null;
  reminderOnDate: Date | null;
  remindAt: Date | null;
  lastNotifiedForRemindAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateEntryResult =
  | { success: true; data: EntrySelect }
  | { success: false; error: string };

export type GetEntriesResult =
  | { success: true; data: EntrySelect[] }
  | { success: false; error: string };

export type BatchResult =
  | { success: true; data: { created: number; updated: number; errors: string[] } }
  | { success: false; error: string };

/**
 * Создание записи профилактики
 */
export async function createEntry(
  userId: string,
  petId: string,
  data: unknown,
): Promise<CreateEntryResult> {
  try {
    const validated = createEntrySchema.parse(data);
    const pet = await prisma.pet.findFirst({
      where: { id: petId, ownerId: userId },
      select: { id: true },
    });
    if (!pet) {
      return { success: false, error: "Питомец не найден" };
    }

    const computed = computeReminderFields({
      performedAt: validated.performedAt,
      type: validated.type,
      reminderEnabled: validated.reminderEnabled,
      reminderKind: validated.reminderKind,
      reminderDaysAfter: validated.reminderDaysAfter ?? null,
      reminderOnDate: validated.reminderOnDate ?? null,
    });

    const entry = await prisma.petPreventionEntry.create({
      data: {
        petId,
        ownerId: userId,
        type: validated.type,
        performedAt: validated.performedAt,
        productName: validated.productName ?? null,
        notes: validated.notes ?? null,
        reminderEnabled: computed.reminderEnabled,
        reminderKind: computed.reminderKind,
        reminderDaysAfter: computed.reminderDaysAfter,
        reminderOnDate: computed.reminderOnDate,
        remindAt: computed.remindAt,
        lastNotifiedForRemindAt: null,
      },
      select: SELECT_ENTRY,
    });
    return { success: true, data: entry };
  } catch (error) {
    const ctx = { petId, userId };
    if (error instanceof ZodError) {
      logPetPreventionFailure("createEntry failed", error, ctx);
      return { success: false, error: USER_MSG_VALIDATION };
    }
    try {
      handlePrismaError(error, "Запись профилактики");
    } catch (serviceError) {
      logPetPreventionFailure("createEntry failed", serviceError, ctx);
      return {
        success: false,
        error: mapServiceErrorToUserMessage(serviceError, USER_MSG_CREATE_FAILED),
      };
    }
    logPetPreventionFailure("createEntry failed", error, ctx);
    return { success: false, error: USER_MSG_CREATE_FAILED };
  }
}

/**
 * Обновление записи профилактики (petId должен совпадать с записью)
 */
export async function updateEntry(
  userId: string,
  petId: string,
  entryId: string,
  data: unknown,
): Promise<CreateEntryResult> {
  try {
    const validated = updateEntrySchema.parse(data);
    const existing = await prisma.petPreventionEntry.findFirst({
      where: { id: entryId, ownerId: userId, petId },
      select: {
        id: true,
        type: true,
        performedAt: true,
        productName: true,
        notes: true,
        reminderEnabled: true,
        reminderKind: true,
        reminderDaysAfter: true,
        reminderOnDate: true,
        remindAt: true,
        lastNotifiedForRemindAt: true,
      },
    });
    if (!existing) {
      return { success: false, error: "Запись не найдена" };
    }

    const merged: CreateEntryInput = {
      type: (validated.type ?? existing.type) as CreateEntryInput["type"],
      performedAt: validated.performedAt ?? existing.performedAt,
      productName:
        validated.productName !== undefined
          ? validated.productName
          : existing.productName ?? undefined,
      notes: validated.notes !== undefined ? validated.notes : existing.notes ?? undefined,
      reminderEnabled: validated.reminderEnabled ?? existing.reminderEnabled,
      reminderKind: validated.reminderKind ?? existing.reminderKind,
      reminderDaysAfter:
        validated.reminderDaysAfter !== undefined
          ? validated.reminderDaysAfter
          : existing.reminderDaysAfter,
      reminderOnDate:
        validated.reminderOnDate !== undefined
          ? validated.reminderOnDate
          : existing.reminderOnDate ?? undefined,
    };

    const computed = computeReminderFields({
      performedAt: merged.performedAt,
      type: merged.type,
      reminderEnabled: merged.reminderEnabled,
      reminderKind: merged.reminderKind,
      reminderDaysAfter: merged.reminderDaysAfter ?? null,
      reminderOnDate: merged.reminderOnDate ?? null,
    });

    const prevRemind = existing.remindAt ? utcDayStart(existing.remindAt).getTime() : null;
    const nextRemind = computed.remindAt ? utcDayStart(computed.remindAt).getTime() : null;
    const lastNotifiedForRemindAt =
      prevRemind === nextRemind ? existing.lastNotifiedForRemindAt : null;

    const entry = await prisma.petPreventionEntry.update({
      where: { id: entryId },
      data: {
        type: merged.type,
        performedAt: merged.performedAt,
        productName: merged.productName,
        notes: merged.notes,
        reminderEnabled: computed.reminderEnabled,
        reminderKind: computed.reminderKind,
        reminderDaysAfter: computed.reminderDaysAfter,
        reminderOnDate: computed.reminderOnDate,
        remindAt: computed.remindAt,
        lastNotifiedForRemindAt,
      },
      select: SELECT_ENTRY,
    });
    return { success: true, data: entry };
  } catch (error) {
    const ctx = { entryId, petId, userId };
    if (error instanceof ZodError) {
      logPetPreventionFailure("updateEntry failed", error, ctx);
      return { success: false, error: USER_MSG_VALIDATION };
    }
    try {
      handlePrismaError(error, "Запись профилактики");
    } catch (serviceError) {
      logPetPreventionFailure("updateEntry failed", serviceError, ctx);
      return {
        success: false,
        error: mapServiceErrorToUserMessage(serviceError, USER_MSG_UPDATE_FAILED),
      };
    }
    logPetPreventionFailure("updateEntry failed", error, ctx);
    return { success: false, error: USER_MSG_UPDATE_FAILED };
  }
}

/**
 * Удаление записи профилактики
 */
export async function deleteEntry(
  userId: string,
  petId: string,
  entryId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const existing = await prisma.petPreventionEntry.findFirst({
      where: { id: entryId, ownerId: userId, petId },
      select: { id: true },
    });
    if (!existing) {
      return { success: false, error: "Запись не найдена" };
    }
    await prisma.petPreventionEntry.delete({
      where: { id: entryId },
    });
    return { success: true };
  } catch (error) {
    const ctx = { entryId, petId, userId };
    if (error instanceof ZodError) {
      logPetPreventionFailure("deleteEntry failed", error, ctx);
      return { success: false, error: USER_MSG_VALIDATION };
    }
    try {
      handlePrismaError(error, "Запись профилактики");
    } catch (serviceError) {
      logPetPreventionFailure("deleteEntry failed", serviceError, ctx);
      return {
        success: false,
        error: mapServiceErrorToUserMessage(serviceError, USER_MSG_DELETE_FAILED),
      };
    }
    logPetPreventionFailure("deleteEntry failed", error, ctx);
    return { success: false, error: USER_MSG_DELETE_FAILED };
  }
}

/**
 * Получение записей профилактики по питомцу
 */
export async function getEntriesByPet(
  userId: string,
  petId: string,
): Promise<GetEntriesResult> {
  try {
    const pet = await prisma.pet.findFirst({
      where: { id: petId, ownerId: userId },
      select: { id: true },
    });
    if (!pet) {
      return { success: false, error: "Питомец не найден" };
    }
    const entries = await prisma.petPreventionEntry.findMany({
      where: { petId },
      orderBy: { performedAt: "desc" },
      take: 100,
      select: SELECT_ENTRY,
    });
    return { success: true, data: entries };
  } catch (error) {
    const ctx = { petId, userId };
    if (error instanceof ZodError) {
      logPetPreventionFailure("getEntriesByPet failed", error, ctx);
      return { success: false, error: USER_MSG_VALIDATION };
    }
    try {
      handlePrismaError(error, "Запись профилактики");
    } catch (serviceError) {
      logPetPreventionFailure("getEntriesByPet failed", serviceError, ctx);
      return {
        success: false,
        error: mapServiceErrorToUserMessage(serviceError, USER_MSG_LOAD_FAILED),
      };
    }
    logPetPreventionFailure("getEntriesByPet failed", error, ctx);
    return { success: false, error: USER_MSG_LOAD_FAILED };
  }
}

function batchEntryToComputed(entry: BatchEntryInput) {
  const reminderEnabled = entry.reminderEnabled ?? true;
  let reminderKind = entry.reminderKind ?? "AFTER_DAYS";
  let reminderDaysAfter =
    entry.reminderDaysAfter !== undefined ? entry.reminderDaysAfter : null;
  const reminderOnDate =
    entry.reminderOnDate !== undefined ? entry.reminderOnDate : null;

  if (reminderEnabled && reminderKind === "ON_DATE" && !reminderOnDate) {
    reminderKind = "AFTER_DAYS";
    reminderDaysAfter =
      reminderDaysAfter ?? DEFAULT_REMINDER_DAYS[entry.type as PetPreventionTypeKey];
  }

  return computeReminderFields({
    performedAt: entry.performedAt,
    type: entry.type as PetPreventionTypeKey,
    reminderEnabled,
    reminderKind,
    reminderDaysAfter,
    reminderOnDate,
  });
}

/**
 * Batch upsert записей (идемпотентность по clientId)
 */
export async function upsertPreventionEntriesBatch(
  userId: string,
  petId: string,
  entries: BatchEntryInput[],
): Promise<BatchResult> {
  try {
    const parsed = batchRequestSchema.parse({ entries });
    const pet = await prisma.pet.findFirst({
      where: { id: petId, ownerId: userId },
      select: { id: true },
    });
    if (!pet) {
      return { success: false, error: "Питомец не найден" };
    }

    let created = 0;
    let updated = 0;

    await prisma.$transaction(async (tx) => {
      for (const entry of parsed.entries) {
        const computed = batchEntryToComputed(entry);
        const existing = await tx.petPreventionEntry.findUnique({
          where: {
            petId_clientId: { petId, clientId: entry.clientId },
          },
          select: { id: true, remindAt: true, lastNotifiedForRemindAt: true },
        });
        if (existing) {
          const prevRemind = existing.remindAt ? utcDayStart(existing.remindAt).getTime() : null;
          const nextRemind = computed.remindAt ? utcDayStart(computed.remindAt).getTime() : null;
          const lastNotifiedForRemindAt =
            prevRemind === nextRemind ? existing.lastNotifiedForRemindAt : null;

          await tx.petPreventionEntry.update({
            where: { id: existing.id },
            data: {
              type: entry.type,
              performedAt: entry.performedAt,
              productName: entry.productName ?? null,
              notes: entry.notes ?? null,
              reminderEnabled: computed.reminderEnabled,
              reminderKind: computed.reminderKind,
              reminderDaysAfter: computed.reminderDaysAfter,
              reminderOnDate: computed.reminderOnDate,
              remindAt: computed.remindAt,
              lastNotifiedForRemindAt,
            },
          });
          updated += 1;
        } else {
          await tx.petPreventionEntry.create({
            data: {
              petId,
              ownerId: userId,
              type: entry.type,
              performedAt: entry.performedAt,
              productName: entry.productName ?? null,
              notes: entry.notes ?? null,
              clientId: entry.clientId,
              reminderEnabled: computed.reminderEnabled,
              reminderKind: computed.reminderKind,
              reminderDaysAfter: computed.reminderDaysAfter,
              reminderOnDate: computed.reminderOnDate,
              remindAt: computed.remindAt,
              lastNotifiedForRemindAt: null,
            },
          });
          created += 1;
        }
      }
    });

    return { success: true, data: { created, updated, errors: [] } };
  } catch (error) {
    const ctx = { petId, userId, count: entries.length };
    if (error instanceof ZodError) {
      logPetPreventionFailure("upsertPreventionEntriesBatch failed", error, ctx);
      return { success: false, error: USER_MSG_VALIDATION };
    }
    try {
      handlePrismaError(error, "Запись профилактики");
    } catch (serviceError) {
      logPetPreventionFailure("upsertPreventionEntriesBatch failed", serviceError, ctx);
      return {
        success: false,
        error: mapServiceErrorToUserMessage(serviceError, USER_MSG_BATCH_FAILED),
      };
    }
    logPetPreventionFailure("upsertPreventionEntriesBatch failed", error, ctx);
    return { success: false, error: USER_MSG_BATCH_FAILED };
  }
}
