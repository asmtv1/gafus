"use server";
import { resetPasswordByToken as resetInCore } from "@gafus/core/services/auth/passwordReset";
/** Next.js action transport; core owns the reset transaction. */
export async function resetPasswordByToken(token: string, newPassword: string) {
  return resetInCore(token, newPassword);
}
