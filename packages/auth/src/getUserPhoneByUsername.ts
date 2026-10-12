"use server";
import { getUserPhoneByUsername as getPhoneInCore } from "@gafus/core/services/auth/passwordReset";
export async function getUserPhoneByUsername(username: string) {
  return getPhoneInCore(username);
}
