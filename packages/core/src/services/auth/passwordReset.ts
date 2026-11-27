import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { createWebLogger } from "@gafus/logger";
import { sendPasswordChangedNoticeEmail } from "./transactionalAuthMail";

const logger = createWebLogger("password-reset");

/** Core password-reset workflow depends on an atomic server receipt port.
 * SQL must consume ONE token, update the password and revoke all sessions
 * inside the SAME transaction. The error classifier is composed from the
 * authoritative server constructor: public InvalidPasswordResetTokenError
 * must remain the same Core class even across separate built packages.
 */
export type PasswordResetReceiptProof =
  | { kind: "token"; tokenHash: string; legacyRawToken?: string }
  | { kind: "shortCode"; shortCode: string };
export interface PasswordResetPorts {
  consumePasswordResetReceipt(
    proof: PasswordResetReceiptProof, passwordHash: string,
  ): Promise<string | null>;
  lookupPhoneByNormalizedUsername(username: string): Promise<string | null>;
  isReceiptUnavailableError(error: unknown): boolean;
}
function requirePasswordResetPort(port: PasswordResetPorts): PasswordResetPorts {
  if (!port) throw new Error("PASSWORD_RESET_PORT_UNBOUND");
  return port;
}

/** Send only after a successful DB commit; mail failure cannot undo a reset. */
async function notifyPasswordReset(email: string | null | undefined): Promise<void> {
  if (!email?.trim()) return;
  try {
    await sendPasswordChangedNoticeEmail(email);
  } catch {
    logger.error("Password reset notice failed", new Error("PASSWORD_RESET_NOTICE_FAILED"));
  }
}

export class InvalidPasswordResetTokenError extends Error {
  constructor() {
    super("Ссылка устарела или уже использована. Откройте последнее письмо или запросите новое.");
    this.name = "InvalidPasswordResetTokenError";
  }
}

/** One atomic state change: password, session revocation, refresh-token revocation, token consumption. */
export async function resetPasswordByToken(token: string, newPassword: string, ports: PasswordResetPorts) {
  const port = requirePasswordResetPort(ports);
  const hashed = await bcrypt.hash(newPassword, 12);
  const tokenHash = `sha256:${createHash("sha256").update(token).digest("hex")}`;
  let email: string | null;
  try {
    email = await port.consumePasswordResetReceipt({
      kind:"token",tokenHash,
      ...( /^[A-Za-z0-9_-]{43}$/.test(token) ? {legacyRawToken:token} : {} ),
    },hashed);
  } catch(error) {
    if(port.isReceiptUnavailableError(error))throw new InvalidPasswordResetTokenError();
    throw error;
  }
  await notifyPasswordReset(email);
}

/** Short-code reset must also revoke old sessions; it grants the same password-changing capability. */
export async function resetPasswordByShortCode(shortCode: string, newPassword: string, ports: PasswordResetPorts) {
  const port = requirePasswordResetPort(ports);
  const hashed = await bcrypt.hash(newPassword, 12);
  let email: string | null;
  try {
    email = await port.consumePasswordResetReceipt({kind:"shortCode",shortCode},hashed);
  } catch(error) {
    if(port.isReceiptUnavailableError(error))throw new Error("Код недействителен или устарел");
    throw error;
  }
  await notifyPasswordReset(email);
}

export async function getUserPhoneByUsername(username: string, ports: PasswordResetPorts) {
  return (requirePasswordResetPort(ports)).lookupPhoneByNormalizedUsername(username);
}
