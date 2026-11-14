import { isSupportedTrainerAIModel } from "./modelPolicy";

export interface TrainerAIConfigMutationContract {
  where: { trainerId?: string };
  create: { trainerId?: string; model?: string | null };
}

/**
 * Configuration validation is a Core policy. The persistence callback must
 * verify the actor's current role INSIDE the SQL transaction holding its lock;
 * a previously checked role is not an authorization receipt.
 */
export function createTrainerAISettingsService<T extends TrainerAIConfigMutationContract>(
  saveTrainerAIConfigAuthorized: (
    actorId: string,
    data: T,
    allowedRoles: readonly ("ADMIN" | "MODERATOR")[],
  ) => Promise<void>,
) {
  return {
    async saveTrainerAIConfiguration(actorId: string, data: T): Promise<void> {
      const created = data.create;
      if (!created.trainerId || created.trainerId !== data.where.trainerId) {
        throw new Error("Некорректный пользователь настроек");
      }
      if (!isSupportedTrainerAIModel(created.model ?? "")) {
        throw new Error("Неподдерживаемая модель OpenRouter");
      }
      await saveTrainerAIConfigAuthorized(actorId, data, ["ADMIN", "MODERATOR"]);
    },
  };
}
