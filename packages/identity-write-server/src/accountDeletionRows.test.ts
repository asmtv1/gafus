import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readAccountDeletionPreflightRow,
  readAccountDeletionActorRow,
  readAccountDeletionAuthoredCounts,
  readAccountDeletionRequestedAt,
  readAccountDeletionChallenge,
  replaceAccountDeletionChallenge,
  deleteAccountAndPersistCleanup,
  deletionPrismaRequestErrorCode,
} from "./accountDeletionRows";

const db = vi.hoisted(() => ({
  userFind: vi.fn(),
  course: vi.fn(),
  trainingDay: vi.fn(),
  step: vi.fn(),
  template: vi.fn(),
  article: vi.fn(),
  challengeFind: vi.fn(),
  challengeDelete: vi.fn(),
  challengeFindUnique: vi.fn(),
  challengeCreate: vi.fn(),
  userUpdate: vi.fn(),
  userDelete: vi.fn(),
  refreshUpdate: vi.fn(),
  consentUpdate: vi.fn(),
  raw: vi.fn(),
  transaction: vi.fn(),
}));
const KnownDatabaseError = vi.hoisted(
  () =>
    class KnownDatabaseError extends Error {
      code: string;
      constructor(code: string) {
        super(code);
        this.code = code;
      }
    },
);
const tx = {
  accountDeletionToken: {
    deleteMany: db.challengeDelete,
    findUnique: db.challengeFindUnique,
    create: db.challengeCreate,
  },
  user: { update: db.userUpdate, delete: db.userDelete },
  refreshToken: { updateMany: db.refreshUpdate },
  consentLog: { updateMany: db.consentUpdate },
  $executeRaw: db.raw,
};
vi.mock("@gafus/prisma", () => ({
  Prisma: {
    DbNull: { _tag: "DbNull" },
    PrismaClientKnownRequestError: KnownDatabaseError,
  },
  prisma: {
    user: { findUnique: db.userFind },
    course: { count: db.course },
    trainingDay: { count: db.trainingDay },
    step: { count: db.step },
    stepTemplate: { count: db.template },
    article: { count: db.article },
    accountDeletionToken: { findFirst: db.challengeFind },
    $transaction: db.transaction,
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  db.transaction.mockImplementation(async (fn) => fn(tx));
  db.challengeFindUnique.mockResolvedValue(null);
  db.challengeCreate.mockResolvedValue({});
  db.userUpdate.mockResolvedValue({});
  db.userDelete.mockResolvedValue({});
  db.raw.mockResolvedValue(1);
});

describe("Account deletion SQL adapter preserves same transaction", () => {
  it("only reads scoped actor and authored rows, without leaking credentials", async () => {
    await readAccountDeletionPreflightRow("owner");
    await readAccountDeletionActorRow("owner");
    await readAccountDeletionRequestedAt("owner");
    await readAccountDeletionChallenge("owner", "123456");
    await readAccountDeletionAuthoredCounts("owner");
    expect(db.userFind).toHaveBeenNthCalledWith(1, {
      where: { id: "owner" },
      select: { id: true, username: true, email: true },
    });
    expect(db.userFind).toHaveBeenNthCalledWith(2, {
      where: { id: "owner" },
      select: { id: true, username: true, role: true, email: true },
    });
    expect(db.challengeFind).toHaveBeenCalledWith({
      where: { userId: "owner", shortCode: "123456" },
    });
    expect(db.course).toHaveBeenCalledWith({ where: { authorId: "owner" } });
    expect(db.article).toHaveBeenCalledWith({ where: { authorId: "owner" } });
  });

  it("retries duplicate random codes, atomically replaces only owner's challenge", async () => {
    db.challengeFindUnique.mockResolvedValueOnce({ id: "conflict" }).mockResolvedValueOnce(null);
    const next = vi.fn().mockReturnValueOnce("111111").mockReturnValueOnce("222222");
    expect(await replaceAccountDeletionChallenge("owner", new Date("2030-01-01Z"), 8, next)).toBe(
      "222222",
    );
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.challengeDelete).toHaveBeenCalledWith({ where: { userId: "owner" } });
    expect(db.challengeCreate).toHaveBeenCalledExactlyOnceWith({
      data: { userId: "owner", shortCode: "222222", expiresAt: new Date("2030-01-01Z") },
    });
    expect(db.userUpdate).toHaveBeenCalledWith({
      where: { id: "owner" },
      data: { accountDeletionRequestedAt: expect.any(Date) },
    });
  });

  it("never deletes user before durable cleanup intent; audit and counter stay in the tx", async () => {
    const queue = vi.fn().mockResolvedValue(undefined);
    await deleteAccountAndPersistCleanup(
      "owner",
      "USER",
      true,
      new Date("2026-11-10T00:00:00Z"),
      queue,
    );
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.refreshUpdate).toHaveBeenCalledWith({
      where: { userId: "owner", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(db.consentUpdate).toHaveBeenCalledWith({
      where: { userId: "owner" },
      data: { formData: { _tag: "DbNull" }, ipAddress: null, userAgent: null },
    });
    expect(queue).toHaveBeenCalledExactlyOnceWith(tx, "owner", new Date("2026-11-10T00:00:00Z"));
    expect(queue.mock.invocationCallOrder[0]).toBeLessThan(
      db.userDelete.mock.invocationCallOrder[0]!,
    );
    expect(db.raw).toHaveBeenCalledTimes(2);
    const statement = db.raw.mock.calls[0]?.[0] as TemplateStringsArray;
    expect(statement.join("")).toContain('INSERT INTO "AccountDeletionAudit"');
    expect((db.raw.mock.calls[1]?.[0] as TemplateStringsArray).join("")).toContain(
      'INSERT INTO "AccountDeletionCounter"',
    );
  });

  it("a failed cleanup aborts the exact SQL mutation before user deletion or audit", async () => {
    await expect(
      deleteAccountAndPersistCleanup("owner", "USER", false, new Date(), async () => {
        throw Error("SYNTHETIC_CLEANUP_FAILED");
      }),
    ).rejects.toThrow("SYNTHETIC_CLEANUP_FAILED");
    expect(db.userDelete).not.toHaveBeenCalled();
    expect(db.raw).not.toHaveBeenCalled();
  });

  it("known Prisma codes are narrowed without treating unrelated errors as Prisma", () => {
    expect(deletionPrismaRequestErrorCode(new KnownDatabaseError("P2003"))).toBe("P2003");
    expect(deletionPrismaRequestErrorCode(new Error("P2003"))).toBeNull();
  });
});
