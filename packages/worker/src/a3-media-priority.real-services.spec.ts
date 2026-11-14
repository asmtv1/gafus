/** Opt-in disposable PostgreSQL + Redis burst: actual Chat2 SQL outbox against two media BullMQ queues. */
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { Queue, Worker } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  connection as sharedConnection,
  FEED_PROCESSING_QUEUE_NAME, CHAT2_MEDIA_PROCESSING_QUEUE_NAME,
} from "@gafus/queues";
import { processChat2OutboxOnce } from "./chat2-outbox-worker";

const pg = process.env.DATABASE_URL ?? "";
const redis = process.env.REDIS_URL ?? "";
if (process.env.GAFUS_A3_PRIORITY_ISOLATED_QA !== "1" || process.env.NODE_ENV !== "test" ||
    !/^postgresql:\/\/a3qa@127\.0\.0\.1:\d+\/postgres(?:\?|$)/.test(pg) ||
    !/^redis:\/\/127\.0\.0\.1:\d+$/.test(redis)) {
  throw Error("A3_PRIORITY_MUST_USE_DISPOSABLE_LOOPBACK_DB_AND_REDIS");
}
const port = Number(new URL(redis).port);
const redisConnection = { host: "127.0.0.1", port, maxRetriesPerRequest: null as null };
const eventId = `a3-prio-${randomUUID()}`;
const names = [FEED_PROCESSING_QUEUE_NAME, CHAT2_MEDIA_PROCESSING_QUEUE_NAME];
let queues: Queue[] = [];
let workers: Worker[] = [];
let broker: Server;
const published: string[] = [];
const originalBroker = process.env.CHAT2_CENTRIFUGO_HTTP_API;
const originalKey = process.env.CHAT2_CENTRIFUGO_API_KEY;

beforeAll(async () => {
  broker = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/publish" ||
        req.headers["x-api-key"] !== "a3-isolated-only-broker-key") {
      res.writeHead(403); res.end(); return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { data: { eventId: string } };
    published.push(payload.data.eventId);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ result: {} }));
  });
  await new Promise<void>(resolve => broker.listen(0, "127.0.0.1", resolve));
  const address = broker.address();
  if (!address || typeof address === "string") throw Error("A3_BROKER_NOT_LOOPBACK");
  process.env.CHAT2_CENTRIFUGO_HTTP_API = `http://127.0.0.1:${address.port}/api/publish`;
  process.env.CHAT2_CENTRIFUGO_API_KEY = "a3-isolated-only-broker-key";
  await prisma.$executeRaw`
    INSERT INTO "Chat2OutboxEvent" ("id", "conversationId", "eventType")
    VALUES (${eventId}, 'a3-burst-isolated-room', 'member.joined')`;
  queues = names.map(name => new Queue(name, { connection: redisConnection }));
  // Simulate two independent Worker instances per production media queue name.
  workers = names.flatMap(name => [0, 1].map(() => new Worker(name, async () => {
    await new Promise(resolve => setTimeout(resolve, 8));
    return "synthetic-video-wake";
  }, {
    connection: redisConnection, concurrency: 1,
    limiter: { max: 1, duration: 65 }, // backed up > 6 s across both media queues
  })));
  await Promise.all([...queues.map(q => q.waitUntilReady()), ...workers.map(w => w.waitUntilReady())]);
}, 30_000);

afterAll(async () => {
  await Promise.all(workers.map(worker => worker.close(true)));
  for (const queue of queues) {
    await queue.obliterate({ force: true });
    await queue.close();
  }
  await prisma.chat2OutboxEvent.deleteMany({ where: { id: eventId } });
  await prisma.$disconnect();
  await sharedConnection.quit();
  await new Promise<void>((resolve, reject) => broker.close(error => error ? reject(error) : resolve()));
  if (originalBroker === undefined) delete process.env.CHAT2_CENTRIFUGO_HTTP_API;
  else process.env.CHAT2_CENTRIFUGO_HTTP_API = originalBroker;
  if (originalKey === undefined) delete process.env.CHAT2_CENTRIFUGO_API_KEY;
  else process.env.CHAT2_CENTRIFUGO_API_KEY = originalKey;
}, 30_000);

describe("multi-worker video backlog versus SQL critical outbox", () => {
  it("dispatches one critical event before either media queue drains, with PG fencing", async () => {
    await Promise.all(queues.map((queue, index) => queue.addBulk(Array.from({ length: 110 }, (_, n) => ({
      name: "wake",
      data: { mediaId: `synthetic-${index}-${n}` },
      opts: { jobId: `a3-burst-${index}-${n}`, removeOnComplete: true },
    })))));
    const initial = await Promise.all(queues.map(q => q.getWaitingCount()));
    expect(initial.every(count => count >= 95)).toBe(true);
    const started = performance.now();
    // Two concurrent dispatchers race for the same PG row; only one gets the lease.
    const result = await Promise.all([processChat2OutboxOnce(), processChat2OutboxOnce()]);
    const elapsedMs = performance.now() - started;
    const remaining = await Promise.all(queues.map(q => q.getWaitingCount()));
    const event = await prisma.chat2OutboxEvent.findUniqueOrThrow({ where: { id: eventId } });
    expect(result.reduce((sum, item) => sum + item.delivered, 0)).toBe(1);
    expect(published).toEqual([eventId]);
    expect(event.deliveredAt).not.toBeNull();
    expect(event.claimToken).toBeNull();
    expect(event.attempts).toBe(1);
    expect(remaining.every(count => count > 0)).toBe(true);
    expect(elapsedMs).toBeLessThan(4_000);
    console.log("A3_PRIORITY_BURST_PASS", { initial, remaining, elapsedMs: Math.round(elapsedMs), published: published.length });
  }, 15_000);
});
