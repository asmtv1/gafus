"use server";
import { resetPasswordByShortCode as resetInCore } from "@gafus/core/services/auth/passwordReset";
export async function resetPasswordByShortCode(code: string, newPassword: string) {
  return resetInCore(code, newPassword);
}
