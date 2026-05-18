/**
 * Notes Service - бизнес-логика работы с заметками тренера
 *
 * Этот модуль содержит чистую бизнес-логику без Next.js специфики.
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import type { ActionResult } from "@gafus/types";
import { getErrorMessage, handlePrismaError } from "@gafus/core/errors";
import { createImmediatePushNotification } from "@gafus/core/services/notifications";
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

async function notifyStudentsAboutVisibleNote(studentIds: string[]): Promise<void> {
  const uniqueStudentIds = [...new Set(studentIds)];

  await Promise.all(
    uniqueStudentIds.map(async (studentId) => {
      try {
        await createImmediatePushNotification({
          userId: studentId,
          title: STUDENT_NOTE_PUSH.title,
          body: STUDENT_NOTE_PUSH.body,
          url: STUDENT_NOTE_PUSH.url,
        });
      } catch (error) {
        logger.error("Ошибка при создании push-уведомления о заметке", error as Error, {
          studentId,
        });
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
export async function getStudentNotes(studentId: string): Promise<StudentNote[]> {
  try {
    const notes = await prisma.trainerNote.findMany({
      where: {
        students: {
          some: {
            studentId: studentId,
          },
        },
        entries: {
          some: {
            isVisibleToStudent: true,
          },
        },
      },
      select: {
        id: true,
        title: true,
        tags: true,
        createdAt: true,
        trainer: {
          select: {
            id: true,
            username: true,
            profile: {
              select: {
                fullName: true,
                avatarUrl: true,
              },
            },
          },
        },
        entries: {
          where: {
            isVisibleToStudent: true, // Только видимые записи
          },
          select: {
            id: true,
            content: true,
            order: true,
            isVisibleToStudent: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return notes as StudentNote[];
  } catch (error) {
    logger.error("Ошибка при получении заметок ученика", error as Error, {
      operation: "get_student_notes_error",
      studentId,
    });
    return [];
  }
}

/**
 * Создание заметки тренера. Проверяет: все studentIds — USER, не совпадают с trainerId.
 */
export async function createTrainerNote(
  input: CreateTrainerNoteInput,
  trainerId: string,
): Promise<ActionResult> {
  try {
    const students = await prisma.user.findMany({
      where: { id: { in: input.studentIds } },
      select: { id: true, role: true },
    });
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

    await prisma.$transaction(async (tx) => {
      await tx.trainerNote.create({
        data: {
          trainerId,
          title: input.title ?? null,
          tags: input.tags ?? [],
          students: {
            create: input.studentIds.map((studentId) => ({ studentId })),
          },
          entries: {
            create: input.entries.map((entry, index) => ({
              content: entry.content,
              order: entry.order ?? index,
              isVisibleToStudent: entry.isVisibleToStudent ?? false,
            })),
          },
        },
      });
    });

    if (input.entries.some((entry) => entry.isVisibleToStudent === true)) {
      await notifyStudentsAboutVisibleNote(input.studentIds);
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
  input: UpdateTrainerNoteInput,
  trainerId: string,
  isAdmin: boolean,
): Promise<ActionResult> {
  try {
    const note = await prisma.trainerNote.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        trainerId: true,
        students: { select: { studentId: true } },
        entries: { select: { content: true, isVisibleToStudent: true } },
      },
    });
    if (!note) {
      return { success: false, error: "Заметка не найдена" };
    }
    if (!isAdmin && note.trainerId !== trainerId) {
      return { success: false, error: "Недостаточно прав доступа" };
    }

    if (input.studentIds !== undefined) {
      const students = await prisma.user.findMany({
        where: { id: { in: input.studentIds } },
        select: { id: true, role: true },
      });
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

    await prisma.$transaction(async (tx) => {
      await tx.trainerNote.update({
        where: { id: input.id },
        data: updateData,
      });
    });

    const previousStudentIds = note.students.map((student) => student.studentId);
    const nextStudentIds = input.studentIds ?? previousStudentIds;
    const previousVisibleContents = getVisibleEntryContents(note.entries);
    const nextEntries = input.entries ?? note.entries;
    const nextVisibleContents = getVisibleEntryContents(nextEntries);
    const hasNewVisibleEntry =
      input.entries?.some(
        (entry) =>
          entry.isVisibleToStudent === true &&
          !previousVisibleContents.has(entry.content.trim()),
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
      await notifyStudentsAboutVisibleNote([...studentIdsToNotify]);
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
  input: DeleteTrainerNoteInput,
  trainerId: string,
  isAdmin: boolean,
): Promise<ActionResult> {
  try {
    const note = await prisma.trainerNote.findUnique({
      where: { id: input.id },
      select: { id: true, trainerId: true },
    });
    if (!note) {
      return { success: false, error: "Заметка уже удалена" };
    }
    if (!isAdmin && note.trainerId !== trainerId) {
      return { success: false, error: "Недостаточно прав доступа" };
    }

    await prisma.trainerNote.delete({ where: { id: input.id } });
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
  query: NotesQueryInput,
): Promise<PagerResult<TrainerNoteDto>> {
  const { page, pageSize, tags, studentId, trainerId } = query;
  const where = {
    ...(trainerId != null && { trainerId }),
    ...(studentId && {
      students: { some: { studentId } },
    }),
    ...(tags && tags.length > 0 && { tags: { hasSome: tags } }),
  };

  const [notes, total] = await Promise.all([
    prisma.trainerNote.findMany({
      where,
      select: {
        id: true,
        trainerId: true,
        title: true,
        tags: true,
        createdAt: true,
        entries: {
          select: {
            id: true,
            content: true,
            order: true,
            isVisibleToStudent: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { order: "asc" },
        },
        students: {
          select: {
            student: {
              select: {
                id: true,
                username: true,
                profile: { select: { fullName: true, avatarUrl: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: page * pageSize,
      take: pageSize,
    }),
    prisma.trainerNote.count({ where }),
  ]);

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
