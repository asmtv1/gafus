import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const mock = vi.hoisted(() => ({
 consume: vi.fn(), notice: vi.fn(), bcrypt: vi.fn(), logError: vi.fn(),
}));
vi.mock("@gafus/identity-write-server/password-reset",()=>({
 consumePasswordResetReceipt:(...args:unknown[])=>mock.consume(...args),
 lookupPhoneByNormalizedUsername:vi.fn(),
 ResetReceiptUnavailableError:class ResetReceiptUnavailableError extends Error{},
}));
vi.mock("bcryptjs", () => ({ default: { hash: mock.bcrypt } }));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ error: mock.logError }) }));
vi.mock("./transactionalAuthMail", () => ({ sendPasswordChangedNoticeEmail: mock.notice }));
import {resetPasswordByToken,resetPasswordByShortCode,InvalidPasswordResetTokenError} from "./passwordReset";

import {
  consumePasswordResetReceipt,
  lookupPhoneByNormalizedUsername,
  ResetReceiptUnavailableError,
} from "@gafus/identity-write-server/password-reset";
const port = {
  consumePasswordResetReceipt,
  lookupPhoneByNormalizedUsername,
  isReceiptUnavailableError: (error: unknown) => error instanceof ResetReceiptUnavailableError,
};


beforeEach(()=>{
 vi.resetAllMocks();
 mock.bcrypt.mockResolvedValue("hashed-bcrypt-12");
 mock.consume.mockResolvedValue("owner@example.test");
 mock.notice.mockResolvedValue(undefined);
});
describe("reset notices run strictly after the atomic credential-and-session receipt transaction",()=>{
 it.each(["token","short-code"])("%s: sends only after server persistence commits",async flow=>{
  let committed=false;
  mock.consume.mockImplementationOnce(async()=>{
   expect(mock.notice).not.toHaveBeenCalled();
   committed=true;return "owner@example.test";
  });
  if(flow==="token")await resetPasswordByToken("valid-token","NewPass9", port);
  else await resetPasswordByShortCode("valid-short-code","NewPass9", port);
  expect(committed).toBe(true);
  expect(mock.notice).toHaveBeenCalledExactlyOnceWith("owner@example.test");
  expect(mock.bcrypt).toHaveBeenCalledExactlyOnceWith("NewPass9",12);
  expect(mock.consume).toHaveBeenCalledWith(expect.any(Object),"hashed-bcrypt-12");
 });
 it("hashed token lookup keeps only sha256 digest, except narrow legacy 43-char fallback",async()=>{
  await resetPasswordByToken("valid-token","NewPass9", port);
  expect(mock.consume.mock.calls[0]?.[0]).toEqual({kind:"token",tokenHash:`sha256:${createHash("sha256").update("valid-token").digest("hex")}`});
 });
 it("mailer failure after commit never changes successful reset acknowledgment",async()=>{
  mock.notice.mockRejectedValueOnce(new Error("SMTP_PROVIDER_INTERNAL"));
  await expect(resetPasswordByToken("valid-token","NewPass9", port)).resolves.toBeUndefined();
  expect(mock.logError).toHaveBeenCalledOnce();
  expect(JSON.stringify(mock.logError.mock.calls)).not.toContain("SMTP_PROVIDER_INTERNAL");
 });
 it("never sends a notice when receipt transaction fails",async()=>{
  mock.consume.mockRejectedValueOnce(new Error("SQL_ABORT"));
  await expect(resetPasswordByToken("bad-token","NewPass9", port)).rejects.toThrow("SQL_ABORT");
  expect(mock.notice).not.toHaveBeenCalled();
 });
 it("maps unavailable reset token to existing public error",async()=>{
  const {ResetReceiptUnavailableError}=await import("@gafus/identity-write-server/password-reset");
  mock.consume.mockRejectedValueOnce(new ResetReceiptUnavailableError());
  await expect(resetPasswordByToken("bad-token","NewPass9", port)).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
  expect(mock.notice).not.toHaveBeenCalled();
 });
});
