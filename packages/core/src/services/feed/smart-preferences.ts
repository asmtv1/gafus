import { z } from "zod/v3";
import { FEED_LIMITS } from "@gafus/types";
import { FeedError } from "./errors";
import { feedParse } from "./schemas";

export const smartPreferenceSchema = z.object({
  enabled: z.boolean().optional(),
  useCity: z.boolean().optional(),
  usePets: z.boolean().optional(),
  useBehavior: z.boolean().optional(),
  exploration: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0, "Ожидалось изменение настроек");
export const smartFeedbackSchema = z.object({ kind: z.literal("not_interested") }).strict();

export const smartImpressionsSchema = z.object({
  events: z.array(z.object({
    eventId: z.string().uuid(),
    postId: z.string().min(1).max(128),
    rankingSessionId: z.string().uuid(),
    algorithmVersion: z.literal("smart-rule-2026-10-a"),
    rank: z.number().int().nonnegative().max(199),
    visibleMs: z.number().int().min(FEED_LIMITS.viewVisibleMilliseconds).max(60_000),
    exposureToken: z.string().uuid().optional(),
  }).strict()).min(1).max(50),
}).strict();

export const smartRankingEventsSchema = z.object({
  events: z.array(z.object({
    eventId: z.string().uuid(),
    postId: z.string().min(1).max(128),
    rankingSessionId: z.string().uuid(),
    algorithmVersion: z.literal("smart-rule-2026-10-a"),
    rank: z.number().int().min(0).max(199),
    exposureToken: z.string().uuid(),
    kind: z.enum(["dwell", "post_open", "profile_open"]),
    durationMs: z.number().int().min(0).max(120_000).optional(),
  }).strict()).min(1).max(30),
}).strict();

const defaults = {
  enabled: true, useCity: true, usePets: true, useBehavior: true, exploration: true,
};

/** SQL-independent application contract. Feed-server is the sole owner of
 * the Prisma projection and atomic reset of derived personalization data. */
export type SmartPreferenceValues = { enabled:boolean;useCity:boolean;usePets:boolean;useBehavior:boolean;exploration:boolean };
export interface SmartFeedPreferencesPort {
  actorExists(actorId: string): Promise<boolean>;
  read(actorId: string): Promise<SmartPreferenceValues | null>;
  patch(actorId: string, value: Partial<SmartPreferenceValues>, defaults: SmartPreferenceValues): Promise<SmartPreferenceValues>;
  /** One database transaction; never erase bookmarks or durable reactions. */
  resetDerived(actorId: string, at: Date, defaults: SmartPreferenceValues): Promise<void>;
}

export function createSmartFeedPreferences(port: SmartFeedPreferencesPort) {
  async function assertActor(actorId: string) {
    if (!(await port.actorExists(actorId))) throw new FeedError("UNAUTHENTICATED", undefined, 401);
  }
  return {
    async get(actorId: string) {
      await assertActor(actorId);
      return (await port.read(actorId)) ?? defaults;
    },
    async patch(actorId: string, input: unknown) {
      await assertActor(actorId);
      const update = feedParse(smartPreferenceSchema, input);
      return port.patch(actorId, update, defaults);
    },
    async reset(actorId: string) {
      await assertActor(actorId);
      const at = new Date();
      await port.resetDerived(actorId, at, defaults);
      return { reset: true, resetAt: at.toISOString() };
    },
  };
}
