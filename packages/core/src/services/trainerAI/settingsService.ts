import { prisma, type Prisma } from "@gafus/prisma";
import { isSupportedTrainerAIModel } from "./modelPolicy";

/** Authorization and persistence are one transactional core use case. */
export async function saveTrainerAIConfiguration(
  actorId: string,
  data: Prisma.TrainerAIConfigUpsertArgs,
): Promise<void> {
  const created = data.create;
  if (!created.trainerId || created.trainerId !== data.where.trainerId) {
    throw new Error("Некорректный пользователь настроек");
  }
  if (!isSupportedTrainerAIModel(created.model ?? "")) {
    throw new Error("Неподдерживаемая модель OpenRouter");
  }
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`;
    const actor = await tx.user.findUnique({
      where: { id: actorId }, select: { role: true },
    });
    if (!actor || !["ADMIN", "MODERATOR"].includes(actor.role)) {
      throw new Error("Недостаточно прав доступа");
    }
    await tx.trainerAIConfig.upsert(data);
  });
}
