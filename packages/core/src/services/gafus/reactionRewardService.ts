import type { GafusTx } from "./types";
import { getGafusSettingsTx } from "./settingsService";
import { awardActivityTx, awardBonusTx } from "./rewardService";

/** The same transaction must lock before any post reaction mutation. */
export async function lockGafusPostReactionTx(tx: GafusTx, postId: string) {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtext(${`gafus-reaction:${postId}`}))::text AS locked
  `;
}

/** Register only on the FIRST successful publication of a NEW post. */
export async function registerGafusPostPublicationTx(
  tx: GafusTx,
  post: { id: string; authorId: string; publishedAt: Date | null },
  input: { publishedAt: Date; text: string; hasPublishedMedia: boolean },
) {
  if (post.publishedAt) return;
  const settings = await getGafusSettingsTx(tx);
  if (settings.economyEnabled) {
    await tx.gafusPostReactionProgram.create({
      data: {
        postId: post.id, thresholdStep: settings.reactionThreshold,
        settingsRevision: settings.revision, highWaterReactionCount: 0,
      },
    });
  }
  await awardActivityTx(tx, {
    userId: post.authorId, kind: "POST_PUBLISHED",
    eventKey: `activity:post:${post.id}`, sourceEntityId: post.id,
    occurredAt: input.publishedAt,
    content: input.text, hasPublishedMedia: input.hasPublishedMedia,
  });
}

/**
 * Reactors counted once regardless of emoji, except the author.
 * Deletions never reduce high-water or retract rewards.
 * Call after inserting/updating/deleting a reaction under lockGafusPostReactionTx.
 */
export async function advanceGafusReactionMilestonesTx(
  tx: GafusTx, input: {
    postId: string; authorId: string; at: Date;
  },
): Promise<number> {
  const program = await tx.gafusPostReactionProgram.findUnique({
    where: { postId: input.postId },
  });
  if (!program) return 0;
  const eligibleCount = await tx.feedPostReaction.count({
    where: { postId: input.postId, userId: { not: input.authorId } },
  });
  const previous = program.highWaterReactionCount;
  const current = Math.max(previous, eligibleCount);
  if (current === previous) return 0;
  await tx.gafusPostReactionProgram.update({
    where: { postId: input.postId },
    data: { highWaterReactionCount: current },
  });
  const previousBucket = Math.floor(previous / program.thresholdStep);
  const currentBucket = Math.floor(current / program.thresholdStep);
  if (currentBucket <= previousBucket) return 0;

  const settings = await getGafusSettingsTx(tx);
  // Soft signal only; never automatically deny or claw back rewards.
  if (current >= 10) {
    const recentlyAdded = await tx.feedPostReaction.count({
      where: {
        postId: input.postId,
        userId: { not: input.authorId },
        createdAt: { gte: new Date(input.at.getTime() - 60_000), lte: input.at },
      },
    });
    if (recentlyAdded >= 10) {
      const existingSignal = await tx.gafusFraudSignal.findFirst({
        where: {
          userId: input.authorId,
          kind: "REACTION_BURST",
          entityType: "POST", entityId: input.postId,
        },
        select: { id: true },
      });
      if (!existingSignal) {
        await tx.gafusFraudSignal.create({
          data: {
            userId: input.authorId, kind: "REACTION_BURST",
            severity: "MEDIUM", entityType: "POST", entityId: input.postId,
            metadata: { eligibleCount, recentlyAdded, windowSeconds: 60 },
          },
        });
      }
    }
  }
  // Turning rewards off does not allow retroactive grants after a re-enable.
  if (!settings.economyEnabled || !settings.earningEnabled) return 0;
  let total = 0;
  for (let bucket = previousBucket + 1; bucket <= currentBucket; bucket++) {
    const threshold = bucket * program.thresholdStep;
    const eventKey = `bonus:post-reaction:${input.postId}:${threshold}`;
    const reward = await awardBonusTx(tx, {
      userId: input.authorId,
      kind: "POST_REACTION_MILESTONE",
      eventKey,
      sourceEntityId: input.postId,
      occurredAt: input.at,
      metadata: { threshold, eligibleCount },
    });
    if (reward.decision !== "GRANTED") continue;
    await tx.gafusPostReactionMilestone.create({
      data: {
        postId: input.postId, threshold, eligibleReactionCount: eligibleCount,
        rewardEventId: eventKey, settingsRevision: program.settingsRevision,
      },
    });
    total += reward.amount;
  }
  return total;
}