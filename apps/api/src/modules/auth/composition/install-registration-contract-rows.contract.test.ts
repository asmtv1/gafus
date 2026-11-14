import { describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  transact: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({tx:"isolated"})),
  context: vi.fn(async (_tx: unknown, input: {purpose:string;contextTokenHash:string}) => ({
    id:"ctx-1", purpose: input.purpose,
  })),
}));
vi.mock("@gafus/identity-write-server/registration-contract-rows", () => ({
  withRegistrationTransaction: m.transact,
  readRegistrationPromoRowTx: vi.fn(),
  saveRegistrationPromoRowTx: vi.fn(),
  lockRegistrationEmailAttemptTx: vi.fn(),
  readRegistrationEmailAttemptTx: vi.fn(),
  insertRegistrationEmailAttemptTx: vi.fn(),
  finishRegistrationEmailAttemptTx: vi.fn(),
  insertVkRegistrationContextTx: m.context,
  claimVkRegistrationContextUserTx: vi.fn(),
  insertVkLoginGrantTx: vi.fn(),
  consumeVkLoginGrantRowTx: vi.fn(),
}));
describe("API registration-contract SQL port composition", () => {
  it("binds one transaction with hashed PKCE/context and no fabricated auth", async () => {
    const auth = await import("@gafus/core/services/auth");
    await import("./install-registration-contract-rows");
    await expect(auth.createVkRegistrationContext({
      contextToken:"raw-token",state:"raw-state",codeVerifier:"secret-verifier",purpose:"REGISTER",
    })).resolves.toMatchObject({id:"ctx-1",purpose:"REGISTER"});
    expect(m.transact).toHaveBeenCalledTimes(1);
    expect(m.context).toHaveBeenCalledTimes(1);
    expect(m.context.mock.calls[0]?.[1].purpose).toBe("REGISTER");
    expect(m.context.mock.calls[0]?.[1].contextTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(m.context.mock.calls[0]?.[1].contextTokenHash).not.toBe("raw-token");
  });
});
