import { describe, expect, it, vi } from "vitest";
import type { EmailAccountRowsPort } from "./emailAccountFlows";
import {
  sendPasswordResetRequestByEmail,
  requestEmailChange,
  confirmEmailChangeByToken,
} from "./emailAccountFlows";

describe("email account explicit SQL composition", () => {
  function reader() {
    const readPasswordResetRequestUser = vi.fn(async (_email: string) => null);
    const readEmailChangeAccount = vi.fn(async (_id: string) => null);
    const consumeEmailChangeConfirmation = vi.fn(async (_token: string) => null);
    const rows = {
      readPasswordResetRequestUser, readEmailChangeAccount, consumeEmailChangeConfirmation,
    } as unknown as EmailAccountRowsPort;
    return { rows, readPasswordResetRequestUser, readEmailChangeAccount, consumeEmailChangeConfirmation };
  }

  it("keeps two independent SQL owners isolated with unchanged anti-enumeration", async () => {
    const a = reader(), b = reader();
    await expect(sendPasswordResetRequestByEmail("UserA@example.invalid", a.rows)).resolves.toBeUndefined();
    await expect(sendPasswordResetRequestByEmail("UserB@example.invalid", b.rows)).resolves.toBeUndefined();
    expect(a.readPasswordResetRequestUser).toHaveBeenCalledExactlyOnceWith("usera@example.invalid");
    expect(b.readPasswordResetRequestUser).toHaveBeenCalledExactlyOnceWith("userb@example.invalid");
    await expect(requestEmailChange("user-A", "newa@example.invalid", undefined, a.rows))
      .rejects.toThrow("Пользователь не найден");
    await expect(requestEmailChange("user-B", "newb@example.invalid", undefined, b.rows))
      .rejects.toThrow("Пользователь не найден");
    expect(a.readEmailChangeAccount).toHaveBeenCalledExactlyOnceWith("user-A");
    expect(b.readEmailChangeAccount).toHaveBeenCalledExactlyOnceWith("user-B");
    await confirmEmailChangeByToken("token-A", a.rows);
    await confirmEmailChangeByToken("token-B", b.rows);
    expect(a.consumeEmailChangeConfirmation).toHaveBeenCalledExactlyOnceWith("token-A");
    expect(b.consumeEmailChangeConfirmation).toHaveBeenCalledExactlyOnceWith("token-B");
  });

  it("fails closed without a globally registered SQL owner", async () => {
    await expect(sendPasswordResetRequestByEmail("unknown@example.invalid"))
      .rejects.toThrow("EMAIL_ACCOUNT_ROWS_PORT_UNBOUND");
    await expect(confirmEmailChangeByToken("valid-but-unbound"))
      .rejects.toThrow("EMAIL_ACCOUNT_ROWS_PORT_UNBOUND");
  });
});
