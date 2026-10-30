/** AG1-001: approved minimal select+count in a single RepeatableRead snapshot. */
import { prisma } from "@gafus/prisma";

export function readTrainerNotesSummarySnapshot(
  where: { trainerId?: string }, page: number, pageSize: number,
) {
  return prisma.$transaction(async (tx) => {
    const [notes, total] = await Promise.all([
      tx.trainerNote.findMany({
        where,
        select: {id:true,title:true,tags:true,createdAt:true},
        orderBy: [{createdAt:"desc"}, {id:"desc"}],
        skip: page * pageSize,
        take: pageSize,
      }),
      tx.trainerNote.count({where}),
    ]);
    return { notes, total };
  }, {isolationLevel:"RepeatableRead"});
}
