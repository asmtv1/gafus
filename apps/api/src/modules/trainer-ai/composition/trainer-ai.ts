/**
 * Single server-side Trainer AI composition; Core applies validation and
 * actor-scoped policy, while the unchanged SQL adapter retains FOR UPDATE,
 * role recheck and atomic two-message writes.
 */
import {
  createTrainerAIService,
  createTrainerAISettingsService,
} from "@gafus/core/services/trainerAI";
import {
  readTrainerAIActorRole,
  readTrainerAIStreamConfig,
  readTrainerAISettingsSummary,
  readTrainerAIHistoryRows,
  clearTrainerAIHistoryAuthorized,
  saveTrainerAIExchangeAuthorized,
  saveTrainerAIConfigAuthorized,
} from "@gafus/trainer-ai-server/persistence";

export const {
  assertTrainerAIAccess,
  assertTrainerAISettingsAccess,
  getTrainerAIConfigForStream,
  getTrainerAIConfigForSettings,
  getTrainerAIHistory,
  clearTrainerAIHistory,
  saveTrainerAIExchange,
} = createTrainerAIService({
  readTrainerAIActorRole,
  readTrainerAIStreamConfig,
  readTrainerAISettingsSummary,
  readTrainerAIHistoryRows,
  clearTrainerAIHistoryAuthorized,
  saveTrainerAIExchangeAuthorized,
});

export const { saveTrainerAIConfiguration } = createTrainerAISettingsService(
  saveTrainerAIConfigAuthorized,
);
