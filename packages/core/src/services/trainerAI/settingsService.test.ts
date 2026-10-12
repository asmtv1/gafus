import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  user: vi.fn(),
  lock: vi.fn(),
  upsert: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: { $transaction: mock.transaction },
}));

import { saveTrainerAIConfiguration } from "./settingsService";

const config = {
  where: { trainerId: "trainer-1" },
  create: {
    trainerId: "trainer-1",
    model: "meta-llama/llama-3.3-70b-instruct",
    provider: "openrouter",
    enabled: true,
  },
  update: {
    model: "meta-llama/llama-3.3-70b-instruct",
    provider: "openrouter",
    enabled: true,
  },
};

describe("Trainer AI configuration transactional authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.user.mockResolvedValue({ role: "ADMIN" });
    mock.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $queryRaw: mock.lock, user: { findUnique: mock.user },
        trainerAIConfig: { upsert: mock.upsert } }),
    );
  });

  it("checks the current database role under lock before writing", async () => {
    mock.user.mockResolvedValue({ role: "USER" });
    await expect(saveTrainerAIConfiguration("member-1", config)).rejects.toThrow("Недостаточно прав");
    expect(mock.lock).toHaveBeenCalledOnce();
    expect(mock.upsert).not.toHaveBeenCalled();
  });

  it("allows an administrator to update one trainer", async () => {
    await saveTrainerAIConfiguration("admin-1", config);
    expect(mock.transaction).toHaveBeenCalledOnce();
    expect(mock.upsert).toHaveBeenCalledWith(config);
  });

  it("rejects an unsupported model before DB mutations", async () => {
    await expect(saveTrainerAIConfiguration("admin-1", {
      ...config,
      create: { ...config.create, model: "unknown" },
    })).rejects.toThrow("Неподдерживаемая модель");
    expect(mock.transaction).not.toHaveBeenCalled();
  });

  it("rejects a mismatch between target identity and the created configuration", async () => {
    await expect(saveTrainerAIConfiguration("admin-1", {
      ...config,
      where: { trainerId: "other-trainer" },
    })).rejects.toThrow("Некорректный пользователь");
    expect(mock.transaction).not.toHaveBeenCalled();
  });
});
