/** SQL persistence for trainer/student notes. No business or push provider logic here. */
import { prisma } from "@gafus/prisma";

export interface TrainerNoteEntryInput {
  content: string;
  order?: number;
  isVisibleToStudent?: boolean;
}
export interface CreateTrainerNoteRowsInput {
  title?: string | null;
  tags?: string[];
  studentIds: string[];
  entries: TrainerNoteEntryInput[];
}
export interface TrainerNoteQuery {
  page: number;
  pageSize: number;
  tags?: string[];
  studentId?: string;
  trainerId?: string | null;
}

export async function readStudentNoteRows(studentId: string) {
  return prisma.trainerNote.findMany({
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
}

export async function readTrainerNoteStudentRoles(studentIds: string[]) {
  return prisma.user.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, role: true },
  });
}

export async function createTrainerNoteRows(input: CreateTrainerNoteRowsInput, trainerId: string) {
  return prisma.$transaction(async (tx) => {
    return tx.trainerNote.create({
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
}

export async function readTrainerNoteForUpdate(id: string) {
  return prisma.trainerNote.findUnique({
    where: { id },
    select: {
      id: true,
      trainerId: true,
      students: { select: { studentId: true } },
      entries: { select: { content: true, isVisibleToStudent: true } },
    },
  });
}

export async function updateTrainerNoteRows(
  id: string,
  updateData: {
    title?: string | null;
    tags?: string[];
    students?: { deleteMany: object; create: { studentId: string }[] };
    entries?: {
      deleteMany: object;
      create: { content: string; order: number; isVisibleToStudent: boolean }[];
    };
  },
  actorId: string,
  isAdmin: boolean,
) {
  return prisma.$transaction(async (tx) => {
    await tx.trainerNote.update({
      // Fence the owner inside the write itself: a concurrent reassign must
      // not turn a previously authorized read into a foreign-owner write.
      where: { id, ...(!isAdmin && { trainerId: actorId }) },
      data: updateData,
    });
  });
}

export async function readTrainerNoteForDelete(id: string) {
  return prisma.trainerNote.findUnique({
    where: { id },
    select: { id: true, trainerId: true },
  });
}

export async function deleteTrainerNoteRows(id: string, actorId: string, isAdmin: boolean) {
  return prisma.trainerNote.delete({ where: { id, ...(!isAdmin && { trainerId: actorId }) } });
}

export async function readTrainerNoteRows(query: TrainerNoteQuery) {
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
  return { notes, total };
}
