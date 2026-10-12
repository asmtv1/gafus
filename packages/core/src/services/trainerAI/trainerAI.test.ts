import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
    trainerAIChat: {
      count: mocks.count,
      findMany: mocks.findMany,
      deleteMany: mocks.deleteMany,
    },
  },
}));

import { assertTrainerAIAccess, getTrainerAIHistory, clearTrainerAIHistory } from "./index";

describe("trainer AI history core boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUser.mockResolvedValue({ role: "TRAINER" });
  });

  it("rejects non-trainers before loading chat history", async () => {
    mocks.findUser.mockResolvedValue({ role: "USER" });
    await expect(getTrainerAIHistory("u1")).rejects.toThrow("FORBIDDEN");
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("checks the current database role rather than cached client claims", async () => {
    mocks.findUser.mockResolvedValue(null);
    await expect(assertTrainerAIAccess("missing")).rejects.toThrow("FORBIDDEN");
  });

  it("sorts messages oldest to newest and bounds pagination", async () => {
    mocks.count.mockResolvedValue(3);
    mocks.findMany.mockResolvedValue([
      { id: "2", role: "assistant", content: "Ответ", createdAt: new Date("2026-10-11T10:02Z") },
      { id: "1", role: "user", content: "Вопрос", createdAt: new Date("2026-10-11T10:01Z") },
    ]);
    const r = await getTrainerAIHistory("u1", -3, 500);
    expect(r.messages.map(m => m.id)).toEqual(["1", "2"]);
    expect(r.total).toBe(3);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 100, skip: 0,
    }));
  });

  it("clears only the requesting trainer's messages", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 2 });
    expect(await clearTrainerAIHistory("u1")).toBe(2);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { trainerId: "u1" } });
  });
});
