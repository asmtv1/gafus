/**
 * Notes Service - бизнес-логика работы с заметками тренера
 *
 * Этот модуль содержит чистую бизнес-логику без Next.js специфики.
 */

import type { NotesPersistencePort } from "./notesPersistencePort";
import { createWebLogger } from "@gafus/logger";
import type { ActionResult } from "@gafus/types";
import { getErrorMessage, handlePrismaError } from "@gafus/core/errors";
import type {
  CreateTrainerNoteInput,
  UpdateTrainerNoteInput,
  DeleteTrainerNoteInput,
  NotesQueryInput,
} from "./schemas";

const logger = createWebLogger("trainer-notes");
const STUDENT_NOTE_PUSH = {
  title: "Новая заметка",
  body: "Тренер добавил вам заметку",
  url: "/profile",
} as const;

/** Outbound notification capability supplied by the outer API composition.
 * Domain policy selects recipients and copy; Core never imports a push adapter. */
export type TrainerNotePushPort = (message: {
  userId: string;
  title: string;
  body: string;
  url: string;
}) => Promise<unknown>;

/** Результат пагинированного списка */
export interface PagerResult<T> {
  notes: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Запись заметки для списка (core DTO) */
export interface TrainerNoteEntryDto {
  id: string;
  content: string;
  order: number;
  isVisibleToStudent: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** Заметка тренера для списка (core DTO) */
export interface TrainerNoteDto {
  id: string;
  trainerId: string;
  title: string | null;
  tags: string[];
  createdAt: Date | string;
  entries: TrainerNoteEntryDto[];
  students: {
    id: string;
    username: string;
    profile?: { fullName: string | null; avatarUrl: string | null } | null;
  }[];
}

export interface StudentNoteEntry {
  id: string;
  content: string;
  order: number;
  isVisibleToStudent: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface StudentNote {
  id: string;
  title?: string | null;
  tags: string[];
  entries: StudentNoteEntry[];
  trainer: {
    id: string;
    username: string;
    profile?: {
      fullName?: string | null;
      avatarUrl?: string | null;
    } | null;
  };
  createdAt: Date | string;
}

async function notifyStudentsAboutVisibleNote(studentIds: string[], send: TrainerNotePushPort): Promise<void> {
  const uniqueStudentIds = [...new Set(studentIds)];

  await Promise.all(
    uniqueStudentIds.map(async (studentId) => {
      try {
        await send({
          userId: studentId,
          title: STUDENT_NOTE_PUSH.title,
          body: STUDENT_NOTE_PUSH.body,
          url: STUDENT_NOTE_PUSH.url,
        });
      } catch {
        // Provider exceptions can embed notification tokens or private actor IDs.
        // Existing best-effort behavior: a saved note is not rolled back by push.
        logger.warn("Trainer note push enqueue failed");
      }
    }),
  );
}

function getVisibleEntryContents(
  entries: { content: string; isVisibleToStudent?: boolean | null }[],
): Set<string> {
  return new Set(
    entries
      .filter((entry) => entry.isVisibleToStudent === true)
      .map((entry) => entry.content.trim())
      .filter((content) => content.length > 0),
  );
}

/**
 * Получает заметки, видимые для ученика
 * @param studentId - ID ученика
 * @returns Массив заметок с видимыми записями
 */
export async function getStudentNotes(
  persistence: NotesPersistencePort,
  studentId: string,
  options: { throwOnError?: boolean } = {},
): Promise<StudentNote[]> {
  try {
    const notes = await persistence.readStudentNoteRows(studentId);

    return notes as StudentNote[];
  } catch {
    // Never log a provider exception or a student identifier: both may be private.
    logger.error("Student notes read failed");
    if (options.throwOnError) {
      // Strict API callers must distinguish a failed read from a genuine empty list.
      throw new Error("STUDENT_NOTES_READ_FAILED");
    }
    // Preserve the existing empty-array behavior for legacy direct Core callers.
    return [];
  }
}

/**
 * Создание заметки тренера. Проверяет: все studentIds — USER, не совпадают с trainerId.
 */
export async function createTrainerNote(
  persistence: NotesPersistencePort,
  input: CreateTrainerNoteInput,
  trainerId: string,
  sendNotification: TrainerNotePushPort,
): Promise<ActionResult> {
  if (typeof sendNotification !== "function") throw new Error("NOTE_PUSH_PORT_REQUIRED");
  try {
    const students = await persistence.readTrainerNoteStudentRoles(input.studentIds);
    if (students.length !== input.studentIds.length) {
      return { success: false, error: "Один или несколько учеников не найдены" };
    }
    const nonUser = students.filter((s) => s.role !== "USER");
    if (nonUser.length > 0) {
      return { success: false, error: "Можно создавать заметки только для учеников" };
    }
    if (input.studentIds.includes(trainerId)) {
      return { success: false, error: "Нельзя создавать заметки самому себе" };
    }

    await persistence.createTrainerNoteRows(input, trainerId);

    if (input.entries.some((entry) => entry.isVisibleToStudent === true)) {
      await notifyStudentsAboutVisibleNote(input.studentIds, sendNotification);
    }

    logger.info("Заметка создана", { trainerId, studentIds: input.studentIds });
    return { success: true };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Заметка");
      } catch (serviceError) {
        return {
          success: false,
          error: getErrorMessage(serviceError, "Ошибка при создании заметки"),
        };
      }
    }
    logger.error("Ошибка при создании заметки", error as Error, { trainerId });
    return {
      success: false,
      error: getErrorMessage(error, "Ошибка при создании заметки"),
    };
  }
}

/**
 * Обновление заметки. Проверяет права (владелец или ADMIN). При обновлении studentIds — та же валидация.
 */
export async function updateTrainerNote(
  persistence: NotesPersistencePort,
  input: UpdateTrainerNoteInput,
  trainerId: string,
  isAdmin: boolean,
  sendNotification: TrainerNotePushPort,
): Promise<ActionResult> {
  if (typeof sendNotification !== "function") throw new Error("NOTE_PUSH_PORT_REQUIRED");
  try {
    const note = await persistence.readTrainerNoteForUpdate(input.id);
    if (!note) {
      return { success: false, error: "Заметка не найдена" };
    }
    if (!isAdmin && note.trainerId !== trainerId) {
      return { success: false, error: "Недостаточно прав доступа" };
    }

    if (input.studentIds !== undefined) {
      const students = await persistence.readTrainerNoteStudentRoles(input.studentIds);
      if (students.length !== input.studentIds.length) {
        return { success: false, error: "Один или несколько учеников не найдены" };
      }
      if (students.some((s) => s.role !== "USER")) {
        return { success: false, error: "Можно создавать заметки только для учеников" };
      }
      if (input.studentIds.includes(trainerId)) {
        return { success: false, error: "Нельзя создавать заметки самому себе" };
      }
    }

    const updateData: {
      title?: string | null;
      tags?: string[];
      students?: { deleteMany: object; create: { studentId: string }[] };
      entries?: {
        deleteMany: object;
        create: { content: string; order: number; isVisibleToStudent: boolean }[];
      };
    } = {};
    if (input.title !== undefined) updateData.title = input.title ?? null;
    if (input.tags !== undefined) updateData.tags = input.tags;
    if (input.studentIds !== undefined) {
      updateData.students = {
        deleteMany: {},
        create: input.studentIds.map((studentId) => ({ studentId })),
      };
    }
    if (input.entries !== undefined) {
      updateData.entries = {
        deleteMany: {},
        create: input.entries.map((entry, index) => ({
          content: entry.content,
          order: entry.order ?? index,
          isVisibleToStudent: entry.isVisibleToStudent ?? false,
        })),
      };
    }

    await persistence.updateTrainerNoteRows(input.id, updateData, trainerId, isAdmin);

    const previousStudentIds = note.students.map((student) => student.studentId);
    const nextStudentIds = input.studentIds ?? previousStudentIds;
    const previousVisibleContents = getVisibleEntryContents(note.entries);
    const nextEntries = input.entries ?? note.entries;
    const nextVisibleContents = getVisibleEntryContents(nextEntries);
    const hasNewVisibleEntry =
      input.entries?.some(
        (entry) =>
          entry.isVisibleToStudent === true && !previousVisibleContents.has(entry.content.trim()),
      ) ?? false;
    const previousStudentIdSet = new Set(previousStudentIds);
    const newlyAttachedStudentIds = nextStudentIds.filter(
      (studentId) => !previousStudentIdSet.has(studentId),
    );
    const studentIdsToNotify = new Set<string>();

    if (hasNewVisibleEntry) {
      nextStudentIds.forEach((studentId) => studentIdsToNotify.add(studentId));
    }
    if (nextVisibleContents.size > 0) {
      newlyAttachedStudentIds.forEach((studentId) => studentIdsToNotify.add(studentId));
    }

    if (studentIdsToNotify.size > 0) {
      await notifyStudentsAboutVisibleNote([...studentIdsToNotify], sendNotification);
    }

    logger.info("Заметка обновлена", { noteId: input.id, trainerId });
    return { success: true };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Заметка");
      } catch (serviceError) {
        return {
          success: false,
          error: getErrorMessage(serviceError, "Ошибка при обновлении заметки"),
        };
      }
    }
    logger.error("Ошибка при обновлении заметки", error as Error, { trainerId });
    return {
      success: false,
      error: getErrorMessage(error, "Ошибка при обновлении заметки"),
    };
  }
}

/**
 * Удаление заметки. Проверяет права (владелец или ADMIN).
 */
export async function deleteTrainerNote(
  persistence: NotesPersistencePort,
  input: DeleteTrainerNoteInput,
  trainerId: string,
  isAdmin: boolean,
): Promise<ActionResult> {
  try {
    const note = await persistence.readTrainerNoteForDelete(input.id);
    if (!note) {
      return { success: false, error: "Заметка уже удалена" };
    }
    if (!isAdmin && note.trainerId !== trainerId) {
      return { success: false, error: "Недостаточно прав доступа" };
    }

    await persistence.deleteTrainerNoteRows(input.id, trainerId, isAdmin);
    logger.info("Заметка удалена", { noteId: input.id, trainerId });
    return { success: true };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Заметка");
      } catch (serviceError) {
        return {
          success: false,
          error: getErrorMessage(serviceError, "Ошибка при удалении заметки"),
        };
      }
    }
    logger.error("Ошибка при удалении заметки", error as Error, { trainerId });
    return {
      success: false,
      error: getErrorMessage(error, "Ошибка при удалении заметки"),
    };
  }
}

/**
 * Список заметок тренера с пагинацией и фильтрами.
 * @param query - page, pageSize, tags?, studentId?, trainerId? (null для ADMIN — все заметки)
 */
export async function getTrainerNotes(
  persistence: NotesPersistencePort,
  query: NotesQueryInput,
): Promise<PagerResult<TrainerNoteDto>> {
  const { page, pageSize } = query;
  const { notes, total } = await persistence.readTrainerNoteRows(query);

  const transformedNotes: TrainerNoteDto[] = notes.map((n) => ({
    id: n.id,
    trainerId: n.trainerId,
    title: n.title,
    tags: n.tags,
    createdAt: n.createdAt,
    entries: n.entries,
    students: n.students.map((s) => ({
      id: s.student.id,
      username: s.student.username,
      profile: s.student.profile ?? null,
    })),
  }));

  return { notes: transformedNotes, total, page, pageSize };
}
