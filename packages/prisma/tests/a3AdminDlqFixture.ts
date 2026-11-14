/** Disposable-DB test fixture; Prisma must stay on the Persistence side.
 * Imported ONLY by the opt-in Hono integration test, never by a production route.
 */
import { prisma } from "../src/client";

const url = process.env.DATABASE_URL ?? "";
if (process.env.GAFUS_A3_ADMIN_DLQ_ISOLATED_QA !== "1" ||
    !/^postgresql:\/\/a3qa@127\.0\.0\.1:\d+\/postgres(?:\?|$)/.test(url)) {
  throw Error("A3_ADMIN_DLQ_FIXTURE_REQUIRES_DISPOSABLE_LOOPBACK_POSTGRES");
}

const id = (n: number) => `a3_isolated_event_${String(n).padStart(3, "0")}`;

async function clear() {
  await prisma.chat2OutboxEvent.deleteMany({
    where: { id: { startsWith: "a3_isolated_event_" } },
  });
}

async function seed(n: number, opts: { delivered?: boolean; claimed?: boolean; dead?: boolean } = {}) {
  await prisma.$executeRaw`
    INSERT INTO "Chat2OutboxEvent"
      ("id", "conversationId", "eventType", "attempts", "deadLetteredAt", "deliveredAt", "claimedUntil", "lastErrorCode", "operationId", "traceId")
    VALUES (${id(n)}, 'a3-local-room', 'member.joined', 8,
      ${opts.dead === false ? null : new Date()}, ${opts.delivered ? new Date() : null},
      ${opts.claimed ? new Date(Date.now() + 60_000) : null},
      'CHAT2_BROKER_AUTH_DENIED', 'a3-local-op', ${"a".repeat(32)})`;
}

async function state(n: number) {
  return prisma.chat2OutboxEvent.findUnique({
    where: { id: id(n) },
    select: {
      deadLetteredAt: true,
      lastErrorCode: true,
      attempts: true,
      claimToken: true,
      claimedUntil: true,
      nextAttemptAt: true,
    },
  });
}

/** A tiny serializable fixture API: no raw ORM handle crosses back to Hono. */
export const a3AdminDlqFixture = {
  id,
  reset: clear,
  seed,
  state,
  disconnect: () => prisma.$disconnect(),
};
