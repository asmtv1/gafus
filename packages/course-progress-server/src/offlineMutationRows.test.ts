import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  withOfflineMutationTx,
  claimPracticeReceipt,
  findPracticeReceipt,
  incrementPracticeRevision,
  commitPracticeReceipt,
  lookupOfflineMutationReceipt,
  lockOwnedPreventionPet,
  claimPreventionReceipt,
  findPreventionReceipt,
  findPreventionBoundClient,
  readPreventionClientRow,
  persistPreventionClientBinding,
  incrementPreventionRevision,
  commitPreventionReceipt,
} from "./offlineMutationRows";
const db = vi.hoisted(() => ({
  transaction: vi.fn(),
  tagQuery: vi.fn(),
  tagExecute: vi.fn(),
  rawQuery: vi.fn(),
  rawExecute: vi.fn(),
  preventionUnique: vi.fn(),
}));
const sql = vi.hoisted(() => (strings: TemplateStringsArray, ...values: unknown[]) => ({
  query: strings.join("?"),
  values,
}));
const tx = {
  $queryRaw: db.tagQuery,
  $executeRaw: db.tagExecute,
  $queryRawUnsafe: db.rawQuery,
  $executeRawUnsafe: db.rawExecute,
  petPreventionEntry: { findUnique: db.preventionUnique },
};
vi.mock("@gafus/prisma", () => ({
  prisma: { $transaction: db.transaction, $queryRaw: db.tagQuery },
  Prisma: { sql },
}));
beforeEach(() => {
  vi.resetAllMocks();
  db.transaction.mockImplementation(async (fn) => fn(tx));
  db.tagQuery.mockResolvedValue([]);
  db.tagExecute.mockResolvedValue(1);
  db.rawQuery.mockResolvedValue([]);
  db.rawExecute.mockResolvedValue(1);
});
describe("offline V2 journal SQL port (source review only)", () => {
  it("binds all journal effects to a single bounded transaction", async () => {
    await withOfflineMutationTx(async (client) => {
      expect(client).toBe(tx);
      await claimPracticeReceipt(
        client,
        "owner",
        "event",
        "training.complete.practice",
        "key",
        "hash",
      );
    });
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 10000 });
    expect((db.tagQuery.mock.calls[0]?.[0] as ReturnType<typeof sql>).values).toEqual([
      expect.any(String),
      "owner",
      "event",
      "training.complete.practice",
      "key",
      "hash",
    ]);
  });
  it("practice duplicate read and revision increment scope by owner/key", async () => {
    await findPracticeReceipt(tx, "owner", "event");
    const duplicate = db.tagQuery.mock.calls[0]?.[0] as ReturnType<typeof sql>;
    expect(duplicate.query).toContain("OfflineMutationReceipt");
    expect(duplicate.values).toEqual(["owner", "event"]);
    await incrementPracticeRevision(tx, "owner", "key");
    const rev = db.tagQuery.mock.calls[1]?.[0] as ReturnType<typeof sql>;
    expect(rev.query).toContain("RETURNING");
    expect(rev.values).toEqual(["owner", "key"]);
    await lookupOfflineMutationReceipt("owner", "event");
    expect((db.tagQuery.mock.calls[2]?.[0] as ReturnType<typeof sql>).values).toEqual([
      "owner",
      "event",
    ]);
  });
  it("prevention parent claim and pet lock require owner scope", async () => {
    await lockOwnedPreventionPet(tx, "pet", "owner");
    expect(db.rawQuery).toHaveBeenCalledWith(
      expect.stringContaining('AND "ownerId" = $2 FOR UPDATE'),
      "pet",
      "owner",
    );
    await claimPreventionReceipt(tx, "receipt", "owner", "event", "key", "hash");
    const call = db.rawQuery.mock.calls[1]!;
    expect(call.slice(-8)).toEqual([
      "receipt",
      "owner",
      "event",
      "POST",
      "prevention.batch",
      "key",
      "hash",
      "RESERVED",
    ]);
    await findPreventionReceipt(tx, "owner", "event");
    expect(db.rawQuery.mock.calls[2]?.slice(-2)).toEqual(["owner", "event"]);
  });
  it("clientId lookup and binding are scoped by pet, owner and receipt", async () => {
    await findPreventionBoundClient(tx, "pet", "clientId");
    expect(db.rawQuery.mock.calls[0]?.slice(-2)).toEqual(["pet", "clientId"]);
    await readPreventionClientRow(tx, "pet", "clientId");
    expect(db.preventionUnique).toHaveBeenCalledWith({
      where: { petId_clientId: { petId: "pet", clientId: "clientId" } },
      select: { id: true },
    });
    await persistPreventionClientBinding(tx, "owner", "pet", "clientId", "sha256", "receipt");
    const insert = db.rawExecute.mock.calls[0]!;
    expect(insert.slice(-5)).toEqual(["owner", "pet", "clientId", "sha256", "receipt"]);
  });
  it("practise and prevention ACK commits are fenced by receipt and owner", async () => {
    const ack = { success: true, ack: { eventId: "event", serverRevision: "1" } };
    await commitPracticeReceipt(tx, 1n, ack, "receipt", "owner");
    expect((db.tagExecute.mock.calls[0]?.[0] as ReturnType<typeof sql>).values).toEqual([
      1n,
      JSON.stringify(ack),
      "receipt",
      "owner",
    ]);
    await incrementPreventionRevision(tx, "owner", "key");
    expect(db.rawQuery.mock.calls[0]?.slice(-2)).toEqual(["owner", "key"]);
    await commitPreventionReceipt(tx, 1n, ack, "receipt", "owner");
    expect(db.rawExecute.mock.calls[0]?.slice(-7)).toEqual([
      "COMMITTED",
      1n,
      200,
      JSON.stringify(ack),
      "receipt",
      "owner",
      "RESERVED",
    ]);
  });
});
