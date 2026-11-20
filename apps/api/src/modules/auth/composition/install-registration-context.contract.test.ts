import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  completed: vi.fn(async () => false),
}));
vi.mock("@gafus/identity-write-server/registration-context-reads", () => ({
  withRegistrationTransaction: vi.fn(),
  readIsRegistrationCompleted: mock.completed,
}));

describe("API registration-context composition", () => {
  it("always checks registration completion in authoritative DB", async () => {
    const core = await import("@gafus/core/services/auth");
    await import("./install-registration-context");
    await expect(core.isRegistrationCompleted("owner-A")).resolves.toBe(false);
    expect(mock.completed).toHaveBeenCalledExactlyOnceWith("owner-A");
  });
});
