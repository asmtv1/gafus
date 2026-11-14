import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  completed: vi.fn(async () => false),
  lookup: vi.fn(async (_tokenHash: string) => ({ codeVerifier: "protected" })),
}));
vi.mock("@gafus/identity-write-server/registration-context-reads", () => ({
  withRegistrationTransaction: vi.fn(),
  readValidVkRegistrationContext: mock.lookup,
  readVkRegistrationConsentContext: vi.fn(),
  readVkRegistrationPendingUsername: vi.fn(),
  readIsRegistrationCompleted: mock.completed,
  readVkLinkedAccountUsername: vi.fn(),
}));

describe("API registration-context composition", () => {
  it("uses authoritative server registration status and hashes opaque VK tokens", async () => {
    const core = await import("@gafus/core/services/auth");
    await import("./install-registration-context");
    await expect(core.isRegistrationCompleted("owner-A")).resolves.toBe(false);
    expect(mock.completed).toHaveBeenCalledExactlyOnceWith("owner-A");
    await expect(core.getValidVkRegistrationContext("opaque-A"))
      .resolves.toEqual({ codeVerifier: "protected" });
    expect(mock.lookup).toHaveBeenCalledTimes(1);
    expect(mock.lookup.mock.calls[0]?.[0]).not.toBe("opaque-A");
  });
});
