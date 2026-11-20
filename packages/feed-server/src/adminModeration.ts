import { createFeedPreferenceOperations } from "./preferenceRows.js";
import { prisma } from "@gafus/prisma";
import { createFeedPreferences } from "@gafus/core/services/feed";

/** Administrative feed moderation: role checks, transactions and queries stay in core. */
const moderation = createFeedPreferences({ operations: createFeedPreferenceOperations(prisma), enabled: () => true });

export function getAdminFeedReports(actorId: string, cursor: string | null = null) {
  return moderation.reports(actorId, { cursor });
}

export function moderateAdminFeedReport(actorId: string, id: string, input: unknown) {
  return moderation.moderate(actorId, id, input);
}
