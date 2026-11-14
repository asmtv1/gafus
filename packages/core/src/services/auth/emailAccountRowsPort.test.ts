import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailAccountRowsPort } from "./emailAccountFlows";
const io = vi.hoisted(() => ({ mail: vi.fn(), notice: vi.fn(), confirm: vi.fn(), error: vi.fn() }));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), error: io.error }),
}));
vi.mock("./transactionalAuthMail", () => ({
  getPublicWebBaseUrl: () => "https://example.invalid",
  sendPasswordResetLinkEmail: io.mail,
  sendEmailChangeConfirmEmail: io.confirm,
  sendEmailChangedNoticeEmail: io.notice,
}));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
function port(): EmailAccountRowsPort {
  return {
    readPasswordResetRequestUser: vi.fn(async () => null),
    claimPasswordResetEmailToken: vi.fn(async () => false),
    rollbackFailedPasswordResetEmailToken: vi.fn(async () => {}),
    retireOlderPasswordResetEmailTokens: vi.fn(async () => {}),
    readEmailChangeAccount: vi.fn(async () => null),
    readEmailOwner: vi.fn(async () => null),
    stageEmailChange: vi.fn(async () => new Date()),
    rollbackUndeliveredEmailChange: vi.fn(async () => {}),
    retireOlderEmailChangeTokens: vi.fn(async () => {}),
    consumeEmailChangeConfirmation: vi.fn(async () => null),
  };
}

describe("email account SQL port maintains public and delivery rules", () => {
  it("without a bound adapter refuses DB reads and sends no reset link", async () => {
    const service = await import("./emailAccountFlows");
    await expect(service.sendPasswordResetRequestByEmail("owner@example.invalid"))
      .rejects.toThrow("EMAIL_ACCOUNT_ROWS_PORT_UNBOUND");
    await expect(service.requestEmailChange("owner-A", "new@example.invalid"))
      .rejects.toThrow("EMAIL_ACCOUNT_ROWS_PORT_UNBOUND");
    await expect(service.confirmEmailChangeByToken("opaque"))
      .rejects.toThrow("EMAIL_ACCOUNT_ROWS_PORT_UNBOUND");
    expect(io.mail).not.toHaveBeenCalled();
    expect(io.confirm).not.toHaveBeenCalled();
  });
  it("preserves anti-enumeration and does not notify for unknown email", async () => {
    const service = await import("./emailAccountFlows");
    const p = port();service.registerEmailAccountRowsPort(p);
    await expect(service.sendPasswordResetRequestByEmail("missing@example.invalid"))
      .resolves.toBeUndefined();
    expect(p.readPasswordResetRequestUser).toHaveBeenCalledWith("missing@example.invalid");
    expect(p.claimPasswordResetEmailToken).not.toHaveBeenCalled();
    expect(io.mail).not.toHaveBeenCalled();
  });
  it("does not swallow a uniqueness violation or change public email errors", async () => {
    const service = await import("./emailAccountFlows");
    const p = port();service.registerEmailAccountRowsPort(p);
    vi.mocked(p.consumeEmailChangeConfirmation).mockRejectedValueOnce({ code: "P2002" });
    await expect(service.confirmEmailChangeByToken("opaque-token"))
      .rejects.toThrow("Этот email уже занят");
    await expect(service.confirmEmailChangeByToken("  "))
      .rejects.toThrow("Ссылка недействительна");
    expect(io.notice).not.toHaveBeenCalled();
  });
  it("keeps one immutable adapter during concurrent account requests", async () => {
    const service = await import("./emailAccountFlows");
    const a = port();service.registerEmailAccountRowsPort(a);service.registerEmailAccountRowsPort(a);
    expect(() => service.registerEmailAccountRowsPort(port()))
      .toThrow("EMAIL_ACCOUNT_ROWS_PORT_ALREADY_BOUND");
  });
});
