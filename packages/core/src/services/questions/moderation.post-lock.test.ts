import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  requireAdmin: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("./service", () => ({ requireQuestionAdmin: mocks.requireAdmin }));
import { moderateQuestionReport, unblockQuestionsUser } from "./moderation";

function fixture(alreadyResolvedAfterLock = false) {
  const report = {
    id: "report1",
    targetKey: "question:question1",
    questionId: "question1",
    answerId: null,
    resolvedAt: null,
    answer: null,
    question: { authorId: "owner1", bestAnswerId: "answer1" },
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    questionReport: {
      findUnique: vi.fn()
        .mockResolvedValueOnce(report)
        .mockResolvedValueOnce({
          resolvedAt: alreadyResolvedAfterLock ? new Date("2026-10-25T10:00:00Z") : null,
        }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    questionBlock: {
      upsert: vi.fn().mockResolvedValue({ userId: "owner1" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    question: {
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    questionAnswer: { update: vi.fn().mockResolvedValue({}) },
  };
  mocks.transaction.mockImplementation(
    async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx),
  );
  return { tx, report };
}
const request = { reportId: "report1", action: "hide" as const, reason: "Спам" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue(undefined);
});

describe("questions moderation / transaction post-lock idempotence", () => {
  it("re-reads report resolution after User and Question locks before any effects", async () => {
    const { tx } = fixture(true);
    await expect(moderateQuestionReport("admin1", request))
      .resolves.toEqual({ id: "report1" });
    expect(mocks.requireAdmin).toHaveBeenCalledWith("admin1", tx);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.questionReport.findUnique).toHaveBeenCalledTimes(2);
    expect(tx.questionReport.findUnique).toHaveBeenNthCalledWith(2, {
      where: { id: "report1" }, select: { resolvedAt: true },
    });
    expect(tx.questionReport.updateMany).not.toHaveBeenCalled();
    expect(tx.question.update).not.toHaveBeenCalled();
    expect(tx.question.updateMany).not.toHaveBeenCalled();
    expect(tx.questionAnswer.update).not.toHaveBeenCalled();
    expect(tx.questionBlock.upsert).not.toHaveBeenCalled();
  });

  it("processes unresolved reports once after confirming the fresh state", async () => {
    const { tx } = fixture();
    await expect(moderateQuestionReport("admin1", request))
      .resolves.toEqual({ id: "report1" });
    expect(tx.questionReport.findUnique).toHaveBeenCalledTimes(2);
    expect(tx.question.update).toHaveBeenCalledWith({
      where: { id: "question1" },
      data: { hiddenAt: expect.any(Date), bestAnswerId: null },
    });
    expect(tx.questionReport.updateMany).toHaveBeenCalledWith({
      where: { targetKey: "question:question1", resolvedAt: null },
      data: { resolvedAt: expect.any(Date), resolution: "hide: Спам" },
    });
  });

  it("does not update another author's block if an overlapping report was resolved", async () => {
    const { tx } = fixture(true);
    await moderateQuestionReport("admin1", {
      reportId: "report1", action: "block", reason: "Нарушение правил",
    });
    expect(tx.questionBlock.upsert).not.toHaveBeenCalled();
    expect(tx.questionReport.updateMany).not.toHaveBeenCalled();
  });

  it("fails closed if the report is missing after waiting for locks", async () => {
    const { tx } = fixture();
    tx.questionReport.findUnique.mockReset()
      .mockResolvedValueOnce({
        id: "report1", targetKey: "question:question1", questionId: "question1",
        answerId: null, resolvedAt: null, answer: null, question: { authorId: "owner1" },
      })
      .mockResolvedValueOnce(null);
    await expect(moderateQuestionReport("admin1", request))
      .rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(tx.questionReport.updateMany).not.toHaveBeenCalled();
    expect(tx.question.update).not.toHaveBeenCalled();
  });

  it("rejects demoted actors within the same transaction before any lock or write", async () => {
    const { tx } = fixture();
    mocks.requireAdmin.mockRejectedValueOnce({ status: 403, code: "FORBIDDEN" });
    await expect(moderateQuestionReport("admin1", request))
      .rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(tx.questionReport.findUnique).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledOnce(); // actor locked before role recheck
  });
  it("unblock locks the actor and target before removing a question-only ban", async () => {
    const { tx } = fixture();
    await expect(unblockQuestionsUser("admin1", "owner1"))
      .resolves.toEqual({ userId: "owner1" });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(mocks.requireAdmin).toHaveBeenCalledWith("admin1", tx);
    expect(tx.questionBlock.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { userId: "owner1" },
    });
  });

  it("unblock rejects revoked admin before touching a user block", async () => {
    const { tx } = fixture();
    mocks.requireAdmin.mockRejectedValueOnce({ status: 403, code: "FORBIDDEN" });
    await expect(unblockQuestionsUser("admin1", "owner1"))
      .rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.questionBlock.deleteMany).not.toHaveBeenCalled();
  });

});
