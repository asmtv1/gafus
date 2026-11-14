import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  role: vi.fn(),
  stream: vi.fn(),
  settings: vi.fn(),
  history: vi.fn(),
  clear: vi.fn(),
  save: vi.fn(),
  configure: vi.fn(),
}));
vi.mock("@gafus/trainer-ai-server/persistence", () => ({
  readTrainerAIActorRole: m.role,
  readTrainerAIStreamConfig: m.stream,
  readTrainerAISettingsSummary: m.settings,
  readTrainerAIHistoryRows: m.history,
  clearTrainerAIHistoryAuthorized: m.clear,
  saveTrainerAIExchangeAuthorized: m.save,
  saveTrainerAIConfigAuthorized: m.configure,
}));
import {
  assertTrainerAIAccess,
  getTrainerAIHistory,
  saveTrainerAIExchange,
  saveTrainerAIConfiguration,
} from "./trainer-ai";

beforeEach(() => {
  vi.clearAllMocks();
  m.role.mockResolvedValue("TRAINER");
  m.history.mockResolvedValue({ total: 0, messages: [] });
  m.save.mockResolvedValue({ id: "message" });
  m.configure.mockResolvedValue(undefined);
});

describe("API composition binds Trainer AI policy to SQL role-locked ports", () => {
  it("reads exact actor-scoped history and live role", async () => {
    expect(await getTrainerAIHistory("trainer-1")).toMatchObject({ total: 0, messages: [] });
    expect(m.role).toHaveBeenCalledExactlyOnceWith("trainer-1");
    expect(m.history).toHaveBeenCalledExactlyOnceWith("trainer-1", 0, 20, [
      "TRAINER",
      "ADMIN",
      "MODERATOR",
    ]);
  });
  it("denies non-staff before querying persisted messages", async () => {
    m.role.mockResolvedValue("USER");
    await expect(assertTrainerAIAccess("member")).rejects.toThrow("FORBIDDEN");
    expect(m.history).not.toHaveBeenCalled();
  });
  it("delegates completed exchange once to atomic persistence", async () => {
    const input = { trainerId: "trainer-1", content: "question", reply: "answer", model: "llm" };
    expect(await saveTrainerAIExchange(input)).toEqual({ id: "message" });
    expect(m.save).toHaveBeenCalledExactlyOnceWith(input, ["TRAINER", "ADMIN", "MODERATOR"]);
  });
  it("never writes invalid model or cross-target configuration", async () => {
    const input = {
      where: { trainerId: "trainer-1" },
      create: { trainerId: "trainer-1", model: "unknown", provider: "openrouter", enabled: true },
      update: { model: "unknown" },
    };
    await expect(saveTrainerAIConfiguration("admin-1", input)).rejects.toThrow(
      "Неподдерживаемая модель",
    );
    expect(m.configure).not.toHaveBeenCalled();
  });
});
