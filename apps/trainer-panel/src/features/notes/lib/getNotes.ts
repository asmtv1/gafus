"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createTrainerPanelLogger } from "@gafus/logger";
import { unstable_cache } from "next/cache";
import { getTrainerNotes } from "@gafus/core/services/notes";
import type { GetNotesResult, TrainerNote } from "../types";

const logger = createTrainerPanelLogger("trainer-panel-notes-get");

/** Кэшированная загрузка списка заметок через core (без Prisma в app). */
export const getNotesCached = unstable_cache(
  async (
    trainerId: string | null,
    studentId: string | undefined,
    tags: string[] | undefined,
    page: number,
    pageSize: number,
  ): Promise<GetNotesResult> => {
    const result = await getTrainerNotes({
      page,
      pageSize,
      studentId,
      tags,
      trainerId,
    });
    return {
      notes: result.notes as TrainerNote[],
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  },
  ["trainer-notes"],
  { revalidate: 60, tags: ["trainer-notes"] },
);

export async function getNotes(
  trainerId: string,
  options?: { studentId?: string; tags?: string[]; page?: number; pageSize?: number },
): Promise<GetNotesResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      throw new Error("Не авторизован");
    }

    const page = options?.page ?? 0;
    const pageSize = options?.pageSize ?? 50;
    const effectiveTrainerId = session.user.role === "ADMIN" ? null : trainerId;

    return await getNotesCached(
      effectiveTrainerId,
      options?.studentId,
      options?.tags,
      page,
      pageSize,
    );
  } catch (error) {
    logger.error("Ошибка при получении заметок", error as Error, {
      trainerId,
      studentId: options?.studentId,
      tags: options?.tags,
      page: options?.page,
    });
    throw error;
  }
}
