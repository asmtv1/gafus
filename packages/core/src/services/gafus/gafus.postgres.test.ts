import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@gafus/prisma";
import { awardActivityTx } from "./rewardService";
import { changeGafusBalanceTx } from "./walletService";
import { lockGafusUser } from "./locking";

// Test fixtures run exclusively against a dedicated disposable local database.
const url = process.env.GAFUS_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)
      || !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
      || parsed.pathname !== "/gafus_test") {
    throw new Error("Dedicated localhost/gafus_test database required");
  }
}
const require = createRequire(new URL("../../../../prisma/package.json", import.meta.url));
const Client = require("@prisma/client").PrismaClient as new (
  args: { datasources: { db: { url: string } } },
) => PrismaClient;
const db = url ? new Client({ datasources: { db: { url } } }) : null;
const messages = [
  "Как мы долго гуляли в красивом осеннем лесу вместе с собакой",
  "Сегодня разучивали команду рядом на площадке возле дома",
  "Подготовили щенку уютное место для спокойного отдыха",
  "Учились понимать сигналы поведения домашних питомцев",
  "Выбирали самый удобный поводок для нашей прогулки",
];

(url ? describe : describe.skip)("Gafus real PostgreSQL concurrency", () => {
  let userId: string;
  beforeEach(async () => {
    userId = randomUUID();
    await db!.user.create({
      data: { id: userId, username: `gafus-e2e-${userId}`, password: randomUUID() },
    });
    await db!.gafusSettings.upsert({
      where: { key: "default" },
      create: { key: "default", economyEnabled: true, earningEnabled: true, spendingEnabled: true },
      update: { economyEnabled: true, earningEnabled: true, spendingEnabled: true,
        postReward: 1, activityLimit: 3, activityWindowSeconds: 86400 },
    });
  });
  afterEach(async () => {
    await db!.gafusNotificationOutbox.deleteMany({ where: { userId } });
    await db!.gafusFraudSignal.deleteMany({ where: { userId } });
    await db!.user.deleteMany({ where: { id: userId } });
  });
  afterAll(async () => {
    if (db) {
      await db.gafusSettings.update({ where: { key: "default" }, data: {
        economyEnabled: false, earningEnabled: false, spendingEnabled: false,
      } });
      await db.$disconnect();
    }
  });
  it("serializes five concurrent grants into only three activity Gafus", async () => {
    const events = await Promise.all(messages.map((text, index) =>
      db!.$transaction(tx => awardActivityTx(tx, {
        userId, kind: "POST_PUBLISHED", content: text,
        eventKey: `activity:${userId}:${index}`, sourceEntityId: `post-${index}`,
        occurredAt: new Date("2026-10-11T00:00:00Z"),
      })),
    ));
    expect(events.filter(x => x.decision === "GRANTED")).toHaveLength(3);
    expect(events.filter(x => x.decision === "DENIED_ACTIVITY_LIMIT")).toHaveLength(2);
    const wallet = await db!.gafusWallet.findUniqueOrThrow({ where: { userId } });
    const ledger = await db!.gafusTransaction.findMany({ where: { userId } });
    expect(wallet.balance).toBe(3);
    expect(ledger.reduce((sum, line) => sum + line.delta, 0)).toBe(3);
  });
  it("serializes five concurrent debits, never below zero", async () => {
    await db!.$transaction(async tx => {
      await lockGafusUser(tx, userId);
      await changeGafusBalanceTx(tx, { userId, amount: 4, kind: "ADMIN_CREDIT",
        idempotencyKey: `initial:${userId}` });
    });
    const results = await Promise.allSettled(Array.from({ length: 5 }, (_, index) =>
      db!.$transaction(async tx => {
        await lockGafusUser(tx, userId);
        return changeGafusBalanceTx(tx, { userId, amount: -1, kind: "SPEND",
          idempotencyKey: `debit:${userId}:${index}` });
      }),
    ));
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(4);
    expect(results.filter(x => x.status === "rejected")).toHaveLength(1);
    const wallet = await db!.gafusWallet.findUniqueOrThrow({ where: { userId } });
    const transactions = await db!.gafusTransaction.findMany({ where: { userId } });
    expect(wallet.balance).toBe(0);
    expect(transactions.reduce((sum, item) => sum + item.delta, 0)).toBe(0);
  });
});
