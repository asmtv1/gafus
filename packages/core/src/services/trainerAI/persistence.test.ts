import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  lock: vi.fn(),
  findActor: vi.fn(),
  insert: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: db.transaction,
  },
}));

import { saveTrainerAIExchange } from "./index";

describe("trainer AI persistence in core", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.findActor.mockResolvedValue({ role: "TRAINER" });
    db.insert.mockResolvedValue({ id: "message-2" });
    db.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        $queryRaw: db.lock,
        user: { findUnique: db.findActor },
        trainerAIChat: { create: db.insert },
      }),
    );
  });

  it("verifies the current role under the same transaction lock", async () => {
    db.findActor.mockResolvedValue({ role: "USER" });
    await expect(saveTrainerAIExchange({
      trainerId: "u1", content: "Вопрос", reply: "Ответ", model: "example",
    })).rejects.toThrow("FORBIDDEN");
    expect(db.lock).toHaveBeenCalledOnce();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("persists a user-and-assistant pair inside one transaction", async () => {
    await saveTrainerAIExchange({
      trainerId: "u1", content: "Вопрос", reply: "Ответ",
      model: "example", tokensUsed: 123,
    });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(db.insert.mock.calls[0][0]).toMatchObject({
      data: { trainerId: "u1", role: "user", content: "Вопрос" },
    });
    expect(db.insert.mock.calls[1][0]).toMatchObject({
      data: { trainerId: "u1", role: "assistant", content: "Ответ", tokensUsed: 123 },
    });
  });
});
