import { prisma } from "@gafus/prisma";
export { saveTrainerAIConfiguration } from "./settingsService";

const TRAINER_AI_ROLES = new Set(["TRAINER", "ADMIN", "MODERATOR"]);
const TRAINER_AI_SETTINGS_ROLES = new Set(["ADMIN", "MODERATOR"]);

export { TRAINER_AI_SUPPORTED_MODELS, isSupportedTrainerAIModel } from "./modelPolicy";

/** Re-evaluate the current role in the database on every settings write. */
export async function assertTrainerAISettingsAccess(actorId: string): Promise<void> {
  const actor = await prisma.user.findUnique({
    where: { id: actorId }, select: { role: true },
  });
  if (!actor || !TRAINER_AI_SETTINGS_ROLES.has(actor.role)) {
    throw new Error("Недостаточно прав доступа");
  }
}

export async function assertTrainerAIAccess(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId }, select: { role: true },
  });
  if (!user || !TRAINER_AI_ROLES.has(user.role)) throw new Error("FORBIDDEN");
}

/** Server-only configuration lookup after verifying the current role. */
export async function getTrainerAIConfigForStream(userId: string) {
  await assertTrainerAIAccess(userId);
  return prisma.trainerAIConfig.findUnique({ where: { trainerId: userId } });
}

/** Allow settings forms to display a safe summary, never raw connection data. */
export async function getTrainerAIConfigForSettings(userId: string) {
  await assertTrainerAIAccess(userId);
  const row = await prisma.trainerAIConfig.findUnique({
    where: { trainerId: userId },
    select: { model: true, enabled: true, apiKey: true },
  });
  return row ? { model: row.model, enabled: row.enabled, hasCustomKey: Boolean(row.apiKey) } : null;
}

export async function getTrainerAIHistory(userId: string, page = 0, pageSize = 20) {
  await assertTrainerAIAccess(userId);
  const safePage = Math.max(0, Math.floor(page));
  const safeSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
  const [total, messages] = await Promise.all([
    prisma.trainerAIChat.count({ where: { trainerId: userId } }),
    prisma.trainerAIChat.findMany({
      where: { trainerId: userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: safeSize,
      skip: safePage * safeSize,
      select: {
        id: true, role: true, content: true,
        tokensUsed: true, attachments: true, createdAt: true,
      },
    }),
  ]);
  const sorted = [...messages].reverse().sort((a, b) => {
    const diff = a.createdAt.getTime() - b.createdAt.getTime();
    return diff || a.id.localeCompare(b.id);
  });
  return {
    messages: sorted.map(message => ({ ...message, role: message.role as "user" | "assistant" })),
    hasMore: total > (safePage + 1) * safeSize,
    total,
  };
}

export async function clearTrainerAIHistory(userId: string): Promise<number> {
  await assertTrainerAIAccess(userId);
  const result = await prisma.trainerAIChat.deleteMany({ where: { trainerId: userId } });
  return result.count;
}

/** Persist a completed exchange atomically; no partial user/assistant pair. */
export async function saveTrainerAIExchange(input: {
  trainerId: string;
  content: string;
  reply: string;
  model: string;
  tokensUsed?: number;
  attachments?: { name?: string; contentType?: string; size?: number }[] | null;
}) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${input.trainerId} FOR UPDATE`;
    const actor = await tx.user.findUnique({
      where: { id: input.trainerId }, select: { role: true },
    });
    if (!actor || !TRAINER_AI_ROLES.has(actor.role)) throw new Error("FORBIDDEN");
    await tx.trainerAIChat.create({
      data: {
        trainerId: input.trainerId,
        role: "user",
        content: input.content,
        model: input.model,
        attachments: input.attachments?.length ? input.attachments : undefined,
      },
    });
    return tx.trainerAIChat.create({
      data: {
        trainerId: input.trainerId,
        role: "assistant",
        content: input.reply,
        model: input.model,
        tokensUsed: input.tokensUsed,
      },
    });
  });
}

export * from "./streamPolicy";
