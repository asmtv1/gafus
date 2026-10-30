/** WEB4 physical WORK PG18: reaction threshold through the one Gafus wallet, no production providers. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { createFeedService } from "./service";
import { createFeedSocial } from "./social";
import type { FeedStoragePort } from "./ports";

const active = process.env.WEB4_REACTION_WORK_PG === "1" ? describe : describe.skip;
const uri = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
const owner = randomUUID();
const reactors = Array.from({ length: 10 }, () => randomUUID());
const ids = [owner, ...reactors];
const storage: FeedStoragePort = {
  enabled: false,
  presignPost: async () => { throw Error("NO_EXTERNAL_PROVIDER"); },
  head: async () => { throw Error("NO_EXTERNAL_PROVIDER"); },
  signCdn: async () => { throw Error("NO_EXTERNAL_PROVIDER"); },
};
const service = createFeedService({ db: prisma, storage, enabled: () => true });
const social = createFeedSocial({ db: prisma, enabled: () => true });
let postId: string | null = null;

async function guard() {
  expect([uri.protocol, uri.hostname, uri.port, uri.pathname, uri.username, uri.search]).toEqual([
    "postgresql:", "127.0.0.1", "55921", "/gafus_refactor_real_work_20261024",
    "gafus_refactor_local_real", "?schema=public",
  ]);
  const meta = await prisma.$queryRaw<{ db: string; role: string; pg: string }[]>`
    SELECT current_database() AS db, current_user AS role, current_setting('server_version_num') AS pg`;
  expect(meta).toEqual([{
    db: "gafus_refactor_real_work_20261024", role: "gafus_refactor_local_real", pg: "180004",
  }]);
}

active("WEB4 real SQL 10 different reactors never duplicate milestone wallet", () => {
  beforeAll(async () => {
    await guard();
    await prisma.user.createMany({ data: ids.map(id => ({
      id, username: `web4_milestone_${id.replaceAll("-", "")}`, password: "NON_LOGIN_FIXTURE",
      role: "USER" as const, registrationPending: false,
    })) });
  }, 30000);

  afterAll(async () => {
    await guard();
    // Synthetic UUID-only scope; unrelated posts/users/events are never touched.
    await prisma.gafusNotificationOutbox.deleteMany({ where: { userId: { in: ids } } });
    await prisma.gafusFraudSignal.deleteMany({ where: { userId: { in: ids } } });
    if (postId) {
      await prisma.gafusPostReactionMilestone.deleteMany({ where: { postId } });
      await prisma.gafusPostReactionProgram.deleteMany({ where: { postId } });
      await prisma.feedStorageJob.deleteMany({ where: { postId, ownerId: owner } });
      await prisma.feedPost.deleteMany({ where: { id: postId, authorId: owner } });
    }
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    expect(await prisma.user.count({ where: { id: { in: ids } } })).toBe(0);
    expect(await prisma.gafusRewardEvent.count({ where: { userId: { in: ids } } })).toBe(0);
    expect(await prisma.gafusTransaction.count({ where: { userId: { in: ids } } })).toBe(0);
    await prisma.$disconnect();
  }, 30000);

  it("author self-reaction excluded, ten independent voters grant once; undo/replay/switch leave ledger unchanged", async () => {
    const post = await service.create(owner, { clientRequestId: randomUUID() });
    postId = post.id;
    await service.saveRevision(owner, postId, {
      clientRequestId: randomUUID(), expectedVersion: 0,
      text: "Десять настоящих уникальных реакций на публикацию после тренировки собаки",
      attachmentIds: [],
    });
    await service.publish(owner, postId, { clientRequestId: randomUUID() });
    expect((await prisma.gafusPostReactionProgram.findUniqueOrThrow({ where: { postId } })).thresholdStep).toBe(10);
    await social.setPostReaction(owner, postId, "❤️");
    for (const userId of reactors.slice(0, 9)) await social.setPostReaction(userId, postId, "❤️");
    expect(await prisma.gafusPostReactionMilestone.count({ where: { postId } })).toBe(0);
    expect((await prisma.gafusPostReactionProgram.findUniqueOrThrow({ where: { postId } })).highWaterReactionCount).toBe(9);
    // At the exact threshold, one shared Wallet/EARN transaction is committed atomically.
    await social.setPostReaction(reactors[9]!, postId, "😂");
    expect(await prisma.gafusPostReactionMilestone.count({ where: { postId } })).toBe(1);
    const milestone = await prisma.gafusPostReactionMilestone.findFirstOrThrow({ where: { postId } });
    expect([milestone.threshold, milestone.eligibleReactionCount]).toEqual([10, 10]);
    const reward = await prisma.gafusRewardEvent.findUniqueOrThrow({
      where: { eventKey: `bonus:post-reaction:${postId}:10` },
    });
    expect(reward).toMatchObject({ userId: owner, rewardKind: "POST_REACTION_MILESTONE", decision: "GRANTED", amount: 1 });
    const transaction = await prisma.gafusTransaction.findUniqueOrThrow({
      where: { idempotencyKey: `gafus:reward:bonus:post-reaction:${postId}:10` },
    });
    expect(transaction).toMatchObject({ userId: owner, delta: 1, rewardKind: "POST_REACTION_MILESTONE" });
    const walletBefore = (await prisma.gafusWallet.findUniqueOrThrow({ where: { userId: owner } })).balance;
    const ledgerBefore = await prisma.gafusTransaction.count({ where: { userId: owner } });
    await social.setPostReaction(reactors[9]!, postId, "😂");
    await social.setPostReaction(reactors[9]!, postId, "🐶");
    await social.removePostReaction(reactors[9]!, postId);
    expect((await prisma.gafusPostReactionProgram.findUniqueOrThrow({ where: { postId } })).highWaterReactionCount).toBe(10);
    await social.setPostReaction(reactors[9]!, postId, "🔥");
    expect(await prisma.gafusPostReactionMilestone.count({ where: { postId } })).toBe(1);
    expect(await prisma.gafusTransaction.count({ where: { userId: owner } })).toBe(ledgerBefore);
    expect((await prisma.gafusWallet.findUniqueOrThrow({ where: { userId: owner } })).balance).toBe(walletBefore);
  }, 60000);
});
