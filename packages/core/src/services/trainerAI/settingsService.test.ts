import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  user: vi.fn(),
  lock: vi.fn(),
  upsert: vi.fn(),
  transaction: vi.fn(),
}));
import { createTrainerAISettingsService } from "./settingsService";
const { saveTrainerAIConfiguration } = createTrainerAISettingsService(mock.transaction);

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
    mock.transaction.mockResolvedValue(undefined);
  });

  it("delegates to role-fenced persistence on success", async () => {
    await saveTrainerAIConfiguration("admin-1", config);
    expect(mock.transaction).toHaveBeenCalledExactlyOnceWith("admin-1", config, [
      "ADMIN",
      "MODERATOR",
    ]);
  });
  it("rejects if current role fails during persistence", async () => {
    mock.transaction.mockRejectedValueOnce(new Error("Недостаточно прав доступа"));
    await expect(saveTrainerAIConfiguration("member-1", config)).rejects.toThrow(
      "Недостаточно прав",
    );
  });

  it("rejects an unsupported model before DB mutations", async () => {
    await expect(
      saveTrainerAIConfiguration("admin-1", {
        ...config,
        create: { ...config.create, model: "unknown" },
      }),
    ).rejects.toThrow("Неподдерживаемая модель");
    expect(mock.transaction).not.toHaveBeenCalled();
  });

  it("rejects a mismatch between target identity and the created configuration", async () => {
    await expect(
      saveTrainerAIConfiguration("admin-1", {
        ...config,
        where: { trainerId: "other-trainer" },
      }),
    ).rejects.toThrow("Некорректный пользователь");
    expect(mock.transaction).not.toHaveBeenCalled();
  });
});
