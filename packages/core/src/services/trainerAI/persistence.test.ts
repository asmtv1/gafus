import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTrainerAIService } from "./index";

const adapter = { save: vi.fn() };
const service = createTrainerAIService({
  readTrainerAIActorRole: vi.fn(),
  readTrainerAIStreamConfig: vi.fn(),
  readTrainerAISettingsSummary: vi.fn(),
  readTrainerAIHistoryRows: vi.fn(),
  clearTrainerAIHistoryAuthorized: vi.fn(),
  saveTrainerAIExchangeAuthorized: adapter.save,
});
beforeEach(() => {
  vi.clearAllMocks();
  adapter.save.mockResolvedValue({ id: "message-2" });
});

describe("Trainer AI Core delegates atomic messages under staff-role policy", () => {
  it("forwards exact trainer and roles to the transaction port", async () => {
    const payload = {
      trainerId: "staff-1",
      content: "Вопрос",
      reply: "Ответ",
      model: "example",
      tokensUsed: 123,
    };
    expect(await service.saveTrainerAIExchange(payload)).toEqual({ id: "message-2" });
    expect(adapter.save).toHaveBeenCalledExactlyOnceWith(payload, [
      "TRAINER",
      "ADMIN",
      "MODERATOR",
    ]);
  });
  it("propagates revoked role and never fabricates success", async () => {
    adapter.save.mockRejectedValueOnce(new Error("FORBIDDEN"));
    await expect(
      service.saveTrainerAIExchange({
        trainerId: "not-staff",
        content: "a",
        reply: "b",
        model: "x",
      }),
    ).rejects.toThrow("FORBIDDEN");
  });
});
