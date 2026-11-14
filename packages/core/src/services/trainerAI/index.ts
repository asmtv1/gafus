/**
 * Core trainer-AI policy, independent of persistence implementation.
 * Runtime SQL/current-role locks belong to the injected server adapter;
 * API composition binds the exact adapter and exports the legacy call shape.
 */
export type TrainerAIRole = "TRAINER" | "ADMIN" | "MODERATOR";
export interface TrainerAIMessage {
  id: string;
  role: string;
  createdAt: Date;
}
export interface TrainerAIExchangeInput {
  trainerId: string;
  content: string;
  reply: string;
  model: string;
  tokensUsed?: number;
  attachments?: { name?: string; contentType?: string; size?: number }[] | null;
}
export interface TrainerAIPersistencePort<
  Stream,
  Settings,
  Message extends TrainerAIMessage,
  Saved,
> {
  readTrainerAIActorRole(actorId: string): Promise<string | null>;
  readTrainerAIStreamConfig(trainerId: string, roles: readonly TrainerAIRole[]): Promise<Stream>;
  readTrainerAISettingsSummary(
    trainerId: string,
    roles: readonly TrainerAIRole[],
  ): Promise<Settings>;
  readTrainerAIHistoryRows(
    trainerId: string,
    skip: number,
    take: number,
    roles: readonly TrainerAIRole[],
  ): Promise<{ total: number; messages: Message[] }>;
  clearTrainerAIHistoryAuthorized(
    trainerId: string,
    roles: readonly TrainerAIRole[],
  ): Promise<number>;
  saveTrainerAIExchangeAuthorized(
    input: TrainerAIExchangeInput,
    roles: readonly TrainerAIRole[],
  ): Promise<Saved>;
}

const TRAINER_AI_ROLES = ["TRAINER", "ADMIN", "MODERATOR"] as const;
const TRAINER_AI_SETTINGS_ROLES = new Set<string>(["ADMIN", "MODERATOR"]);

export { TRAINER_AI_SUPPORTED_MODELS, isSupportedTrainerAIModel } from "./modelPolicy";
export { createTrainerAISettingsService } from "./settingsService";

/** No actor role is ever inferred from the JWT, request body or cached settings. */
export function createTrainerAIService<Stream, Settings, Message extends TrainerAIMessage, Saved>(
  persistence: TrainerAIPersistencePort<Stream, Settings, Message, Saved>,
) {
  async function assertTrainerAIAccess(userId: string): Promise<void> {
    const role = await persistence.readTrainerAIActorRole(userId);
    if (!role || !TRAINER_AI_ROLES.some((allowed) => allowed === role))
      throw new Error("FORBIDDEN");
  }

  async function assertTrainerAISettingsAccess(actorId: string): Promise<void> {
    const role = await persistence.readTrainerAIActorRole(actorId);
    if (!role || !TRAINER_AI_SETTINGS_ROLES.has(role)) throw new Error("Недостаточно прав доступа");
  }

  async function getTrainerAIConfigForStream(userId: string): Promise<Stream> {
    await assertTrainerAIAccess(userId);
    return persistence.readTrainerAIStreamConfig(userId, TRAINER_AI_ROLES);
  }
  async function getTrainerAIConfigForSettings(userId: string): Promise<Settings> {
    await assertTrainerAIAccess(userId);
    return persistence.readTrainerAISettingsSummary(userId, TRAINER_AI_ROLES);
  }
  async function getTrainerAIHistory(userId: string, page = 0, pageSize = 20) {
    await assertTrainerAIAccess(userId);
    const safePage = Math.max(0, Math.floor(page));
    const safeSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
    const { total, messages } = await persistence.readTrainerAIHistoryRows(
      userId,
      safePage * safeSize,
      safeSize,
      TRAINER_AI_ROLES,
    );
    const sorted = [...messages].reverse().sort((a, b) => {
      const diff = a.createdAt.getTime() - b.createdAt.getTime();
      return diff || a.id.localeCompare(b.id);
    });
    return {
      messages: sorted.map((message) => ({
        ...message,
        role: message.role as "user" | "assistant",
      })),
      hasMore: total > (safePage + 1) * safeSize,
      total,
    };
  }
  async function clearTrainerAIHistory(userId: string): Promise<number> {
    await assertTrainerAIAccess(userId);
    return persistence.clearTrainerAIHistoryAuthorized(userId, TRAINER_AI_ROLES);
  }
  async function saveTrainerAIExchange(input: TrainerAIExchangeInput): Promise<Saved> {
    return persistence.saveTrainerAIExchangeAuthorized(input, TRAINER_AI_ROLES);
  }
  return {
    assertTrainerAIAccess,
    assertTrainerAISettingsAccess,
    getTrainerAIConfigForStream,
    getTrainerAIConfigForSettings,
    getTrainerAIHistory,
    clearTrainerAIHistory,
    saveTrainerAIExchange,
  };
}
export * from "./streamPolicy";
