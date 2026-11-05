import { prisma } from "@gafus/prisma";

export interface CompletedDogWalkInput {
  clientId: string;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  steps: number;
  estimatedMeters: number;
  timerMode: "stopwatch" | "countdown";
  incompleteSteps: boolean;
}

/** Any existing authenticated account can access its own walks; owner ID comes from the JWT. */
export async function assertWalkHistoryAccess(ownerId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: ownerId }, select: { id: true },
  });
  if (!user) {
    throw new Error("WALKS_FORBIDDEN");
  }
}

function toDto(record: {
  clientId: string; startedAt: Date; finishedAt: Date;
  durationSeconds: number; steps: number; estimatedMeters: number;
  timerMode: string; incompleteSteps: boolean;
}) {
  return {
    clientId: record.clientId,
    startedAt: record.startedAt.toISOString(),
    finishedAt: record.finishedAt.toISOString(),
    durationSeconds: record.durationSeconds,
    steps: record.steps,
    estimatedMeters: record.estimatedMeters,
    timerMode: record.timerMode === "countdown" ? "countdown" as const : "stopwatch" as const,
    incompleteSteps: record.incompleteSteps,
  };
}

/** Server data is merged into the phone by clientId; the phone wins collisions. */
export async function listCompletedDogWalks(ownerId: string) {
  await assertWalkHistoryAccess(ownerId);
  const data = await prisma.dogWalkRecord.findMany({
    where: { userId: ownerId }, orderBy: { startedAt: "desc" }, take: 2000,
  });
  return data.map(toDto);
}

/** Idempotent, owner-scoped upsert. No userId/role accepted in payload. */
export async function syncCompletedDogWalks(ownerId: string, walks: CompletedDogWalkInput[]) {
  await assertWalkHistoryAccess(ownerId);
  if (walks.length) {
    // A retry of the same batch is safe. Database constraints additionally reject bad rows.
    await prisma.$transaction(walks.map(walk => {
      const data = {
        startedAt: new Date(walk.startedAt),
        finishedAt: new Date(walk.finishedAt),
        durationSeconds: walk.durationSeconds,
        steps: walk.steps,
        estimatedMeters: walk.estimatedMeters,
        timerMode: walk.timerMode,
        incompleteSteps: walk.incompleteSteps,
      };
      return prisma.dogWalkRecord.upsert({
        where: { userId_clientId: { userId: ownerId, clientId: walk.clientId } },
        create: { userId: ownerId, clientId: walk.clientId, ...data },
        update: data,
      });
    }));
  }
  return listCompletedDogWalks(ownerId);
}
