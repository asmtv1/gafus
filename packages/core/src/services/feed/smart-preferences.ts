import { z } from "zod";
import { FEED_LIMITS } from "../../../../types/src/feed";
import type { FeedDb } from "./ports";
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

export function createSmartFeedPreferences(db: FeedDb) {
  async function assertActor(actorId: string) {
    const user = await db.user.findUnique({ where: { id: actorId }, select: { id: true } });
    if (!user) throw new FeedError("UNAUTHENTICATED", undefined, 401);
  }
  return {
    async get(actorId: string) {
      await assertActor(actorId);
      const value = await db.feedPersonalizationPreference.findUnique({ where: { userId: actorId } });
      return value ? {
        enabled: value.enabled, useCity: value.useCity, usePets: value.usePets,
        useBehavior: value.useBehavior, exploration: value.exploration,
      } : defaults;
    },
    async patch(actorId: string, input: unknown) {
      await assertActor(actorId);
      const update = feedParse(smartPreferenceSchema, input);
      const value = await db.feedPersonalizationPreference.upsert({
        where: { userId: actorId },
        create: { userId: actorId, ...defaults, ...update },
        update,
      });
      return {
        enabled: value.enabled, useCity: value.useCity, usePets: value.usePets,
        useBehavior: value.useBehavior, exploration: value.exploration,
      };
    },
    async reset(actorId: string) {
      await assertActor(actorId);
      const at = new Date();
      await db.$transaction(async tx => {
        await tx.feedPersonalizationPreference.upsert({
          where: { userId: actorId },
          create: { userId: actorId, ...defaults, historyResetAt: at },
          update: { historyResetAt: at },
        });
        // Keep real reactions, bookmarks, comments and lifetime view counts.
        await tx.feedUserAuthorAffinity.deleteMany({ where: { userId: actorId } });
        await tx.feedRankingEvent.deleteMany({ where: { userId: actorId } });
        await tx.feedImpression.deleteMany({ where: { userId: actorId } });
        await tx.feedUserPostFeedback.deleteMany({ where: { userId: actorId } });
      });
      return { reset: true, resetAt: at.toISOString() };
    },
  };
}
