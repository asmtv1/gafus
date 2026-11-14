import { describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn() }));
vi.mock("../src/client", () => ({ prisma: { chat2OutboxEvent: db } }));
import { listChatOutboxDeadLetters, retryChatOutboxDeadLetter } from "../src/chat2OutboxDiagnostics";
describe("admin outbox diagnostics and atomic recovery", () => {
  it("only selects bounded non-PII fields for dead letters", async () => {
    db.findMany.mockResolvedValueOnce([]);
    await expect(listChatOutboxDeadLetters()).resolves.toEqual([]);
    const args = db.findMany.mock.calls[0]![0];
    expect(args.take).toBe(50);
    expect(args.where.deadLetteredAt).toEqual({ not: null });
    expect(args.select).not.toHaveProperty("conversationId");
    expect(args.select).not.toHaveProperty("messageId");
  });
  it("retries only a terminal, undelivered and unclaimed event", async () => {
    db.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await retryChatOutboxDeadLetter("safe-event")).toBe(true);
    const query = db.updateMany.mock.calls[0]![0];
    expect(query.where).toMatchObject({ deliveredAt: null, claimedUntil: null, deadLetteredAt: { not: null } });
    expect(query.data).toMatchObject({ attempts: 0, claimToken: null, deadLetteredAt: null });
    db.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await retryChatOutboxDeadLetter("not-terminal")).toBe(false);
  });
});
