import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTrainerAIService } from "./index";

const mocks = {
  findUser: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
};
const service = createTrainerAIService({
  readTrainerAIActorRole: async (actor: string) => {
    const row = await mocks.findUser(actor);
    return row?.role ?? null;
  },
  readTrainerAIStreamConfig: vi.fn(),
  readTrainerAISettingsSummary: vi.fn(),
  readTrainerAIHistoryRows: async (actor: string, skip: number, take: number) => ({
    total: await mocks.count({ where: { trainerId: actor } }),
    messages: await mocks.findMany({ where: { trainerId: actor }, skip, take }),
  }),
  clearTrainerAIHistoryAuthorized: async (actor: string) =>
    (await mocks.deleteMany({ where: { trainerId: actor } })).count,
  saveTrainerAIExchangeAuthorized: vi.fn(),
});
const { assertTrainerAIAccess, getTrainerAIHistory, clearTrainerAIHistory } = service;

describe("Trainer AI Core history projection via explicit server ports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUser.mockResolvedValue({ role: "TRAINER" });
  });

  it("rejects non-trainers before loading chat history", async () => {
    mocks.findUser.mockResolvedValue({ role: "USER" });
    await expect(getTrainerAIHistory("u1")).rejects.toThrow("FORBIDDEN");
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("checks current role rather than cached claims", async () => {
    mocks.findUser.mockResolvedValue(null);
    await expect(assertTrainerAIAccess("missing")).rejects.toThrow("FORBIDDEN");
  });

  it("sorts messages oldest to newest and bounds pagination", async () => {
    mocks.count.mockResolvedValue(3);
    mocks.findMany.mockResolvedValue([
      { id: "2", role: "assistant", content: "Ответ", createdAt: new Date("2026-10-11T10:02Z") },
      { id: "1", role: "user", content: "Вопрос", createdAt: new Date("2026-10-11T10:01Z") },
    ]);
    const result = await getTrainerAIHistory("u1", -3, 500);
    expect(result.messages.map((m) => m.id)).toEqual(["1", "2"]);
    expect(result.total).toBe(3);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
        skip: 0,
      }),
    );
  });

  it("bounds offsets and normalizes non-finite pagination", async () => {
    mocks.count.mockResolvedValue(50000);
    mocks.findMany.mockResolvedValue([]);
    const malformed = await getTrainerAIHistory("u1", NaN, Infinity);
    expect(malformed.hasMore).toBe(true);
    expect(mocks.findMany).toHaveBeenLastCalledWith(expect.objectContaining({skip:0,take:20}));
    const distant = await getTrainerAIHistory("u1", Number.MAX_VALUE, 100);
    expect(distant.hasMore).toBe(false);
    expect(mocks.findMany).toHaveBeenLastCalledWith(expect.objectContaining({skip:Math.floor(Number.MAX_SAFE_INTEGER/100)*100,take:100}));
  });

  it("clears only requesting trainer's messages", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 2 });
    expect(await clearTrainerAIHistory("u1")).toBe(2);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { trainerId: "u1" } });
  });
});
