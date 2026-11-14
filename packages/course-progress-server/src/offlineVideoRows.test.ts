import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  withOfflineVideoSqlTransaction,
  claimOfflineVideoReceipt,
  findOfflineVideoStoredReceipt,
  reserveOfflineVideoRevision,
  readOfflineVideoRevision,
  advanceOfflineVideoRevision,
  commitOfflineVideoReceipt,
} from "./offlineVideoRows";
const db = vi.hoisted(() => ({
  transaction: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
}));
const sql = vi.hoisted(() => (strings: TemplateStringsArray, ...values: unknown[]) => ({
  query: strings.join("?"),
  values,
}));
const tx = { $queryRaw: db.query, $executeRaw: db.execute };
vi.mock("@gafus/prisma", () => ({
  prisma: { $transaction: db.transaction },
  Prisma: { sql },
}));
beforeEach(() => {
  vi.resetAllMocks();
  db.transaction.mockImplementation(async (cb) => cb(tx));
  db.query.mockResolvedValue([]);
  db.execute.mockResolvedValue(1);
});
describe("offline V3 SQL isolation (source-only proposal)", () => {
  it("keeps authorization in bounded transaction", async () => {
    await withOfflineVideoSqlTransaction(async (scoped) => {
      expect(scoped).toBe(tx);
      return "AUTHORIZED";
    });
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 10000 });
  });
  it("claim and duplicate lookup are scoped by owner/event", async () => {
    await claimOfflineVideoReceipt(tx, "owner", "event-1", "key", "hash");
    const claim = db.query.mock.calls[0]?.[0] as ReturnType<typeof sql>;
    expect(claim.query).toContain("ON CONFLICT");
    expect(claim.values).toContain("owner");
    expect(claim.values).toContain("event-1");
    await findOfflineVideoStoredReceipt(tx, "owner", "event-1");
    const row = db.query.mock.calls[1]?.[0] as ReturnType<typeof sql>;
    expect(row.query).toContain("OfflineMutationReceipt");
    expect(row.values).toEqual(["owner", "event-1"]);
  });
  it("resource revision uses a lock and exact CAS version", async () => {
    await reserveOfflineVideoRevision(tx, "owner", "key");
    expect((db.execute.mock.calls[0]?.[0] as ReturnType<typeof sql>).query).toContain(
      "ON CONFLICT",
    );
    await readOfflineVideoRevision(tx, "owner", "key");
    expect((db.query.mock.calls[0]?.[0] as ReturnType<typeof sql>).query).toContain("FOR UPDATE");
    await advanceOfflineVideoRevision(tx, "owner", "key", 2n, 3n, 25, "2026-11-10T00:00:00Z");
    const row = db.execute.mock.calls[1]?.[0] as ReturnType<typeof sql>;
    expect(row.query).toContain("revision");
    expect(row.values).toEqual([3n, 25, "2026-11-10T00:00:00Z", "owner", "key", 2n]);
  });
  it("committed response is persisted with an owner/receipt fence", async () => {
    const ack = { success: true, ack: { eventId: "event-1", replayed: false } };
    await commitOfflineVideoReceipt(tx, "owner", "claim-1", 1n, ack);
    const result = db.execute.mock.calls[0]?.[0] as ReturnType<typeof sql>;
    expect(result.query).toContain("RESERVED");
    expect(result.values).toEqual([1n, JSON.stringify(ack), "claim-1", "owner"]);
  });
});
