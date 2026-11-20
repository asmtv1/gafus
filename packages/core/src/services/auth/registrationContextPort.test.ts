import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistrationContextPorts } from "./registrationUseCases";

const contracts = vi.hoisted(() => ({
  promo: vi.fn(async (_tx: unknown, code: unknown) =>
    code === "WINTER" ? { id: "promo-A", normalizedCode: "WINTER" } : null),
}));
vi.mock("./registrationContracts", () => ({
  resolveRegistrationPromoCodeInTransaction: contracts.promo,
}));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

function adapter() {
  const tx = { transaction: "single-owner-locked" };
  const transaction = vi.fn(async (callback: (value: unknown) => Promise<unknown>) => callback(tx));
  return {
    withRegistrationTransaction: transaction as unknown as RegistrationContextPorts["withRegistrationTransaction"],
    readIsRegistrationCompleted: vi.fn(async () => false),
    tx,
  };
}

describe("Core registration-context Persistence port without VK OAuth", () => {
  it("fails closed for protected requests and promo reads without binding", async () => {
    const core = await import("./registrationUseCases");
    await expect(core.isRegistrationCompleted("owner-A"))
      .rejects.toThrow("REGISTRATION_CONTEXT_PORT_UNBOUND");
    await expect(core.previewRegistrationPromoCode("WINTER"))
      .rejects.toThrow("REGISTRATION_CONTEXT_PORT_UNBOUND");
    expect(contracts.promo).not.toHaveBeenCalled();
  });

  it("reads SQL registration status, using one transaction for promo selection", async () => {
    const core = await import("./registrationUseCases");
    const p = adapter();
    core.registerRegistrationContextPort(p);
    await expect(core.isRegistrationCompleted("owner-B")).resolves.toBe(false);
    expect(p.readIsRegistrationCompleted).toHaveBeenCalledExactlyOnceWith("owner-B");
    await expect(core.previewRegistrationPromoCode("WINTER")).resolves.toEqual({
      id: "promo-A", normalizedCode: "WINTER",
    });
    expect(p.withRegistrationTransaction).toHaveBeenCalledTimes(1);
    expect(contracts.promo).toHaveBeenCalledExactlyOnceWith(p.tx, "WINTER", undefined);
  });

  it("uses independent explicit adapters without touching process-global registration", async () => {
    const core = await import("./registrationUseCases");
    const first = adapter();
    const second = adapter();
    second.readIsRegistrationCompleted.mockResolvedValue(true);
    await expect(core.isRegistrationCompleted("owner-A", first)).resolves.toBe(false);
    await expect(core.isRegistrationCompleted("owner-B", second)).resolves.toBe(true);
    await expect(core.previewRegistrationPromoCode("WINTER", first)).resolves.toMatchObject({
      normalizedCode: "WINTER",
    });
    expect(first.readIsRegistrationCompleted).toHaveBeenCalledExactlyOnceWith("owner-A");
    expect(second.readIsRegistrationCompleted).toHaveBeenCalledExactlyOnceWith("owner-B");
    expect(second.withRegistrationTransaction).not.toHaveBeenCalled();
    await expect(core.isRegistrationCompleted("unbound")).rejects.toThrow("REGISTRATION_CONTEXT_PORT_UNBOUND");
  });

  it("prohibits replacement of a running registration adapter", async () => {
    const core = await import("./registrationUseCases");
    const p = adapter();
    core.registerRegistrationContextPort(p);
    core.registerRegistrationContextPort(p);
    expect(() => core.registerRegistrationContextPort(adapter()))
      .toThrow("REGISTRATION_CONTEXT_PORT_ALREADY_BOUND");
  });
});
