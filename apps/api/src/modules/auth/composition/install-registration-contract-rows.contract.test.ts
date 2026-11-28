import { describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  transact: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({tx:"isolated"})),

}));
vi.mock("@gafus/identity-write-server/registration-contract-rows", () => ({
  withRegistrationTransaction: m.transact,
  readRegistrationPromoRowTx: vi.fn(),
  saveRegistrationPromoRowTx: vi.fn(),
  lockRegistrationEmailAttemptTx: vi.fn(),
  readRegistrationEmailAttemptTx: vi.fn(),
  insertRegistrationEmailAttemptTx: vi.fn(),
  finishRegistrationEmailAttemptTx: vi.fn(),
}));
describe("API registration-contract SQL port composition", () => {
  it("preserves one transactional boundary for password registration promo validation", async () => {
    const auth = await import("@gafus/core/services/auth");
    const { registrationContractRows } = await import("./registration-contract-rows-instance");
    await expect(registrationContractRows.withRegistrationTransaction((tx: unknown) =>
      auth.resolveRegistrationPromoCodeInTransaction(tx, undefined, registrationContractRows),
    )).resolves.toBeNull();
    expect(m.transact).toHaveBeenCalledTimes(1);
  });
});
