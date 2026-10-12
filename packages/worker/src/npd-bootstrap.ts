/**
 * One-time, interactive NPD connection bootstrap. It never writes an SMS code,
 * access token, or raw refresh token to disk or stdout.
 */
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { NpdGateway, encryptRefreshToken } from "@gafus/npd";
import { getNpdBootstrapDeviceId, saveNpdBootstrapConnection } from "@gafus/core/services/appSubscription";
import { disconnectCoreDatabase } from "@gafus/core/services/systemHealth";

const prompt = createInterface({ input: stdin, output: stdout });
async function main(): Promise<void> {
  try {
    const existingDeviceId = await getNpdBootstrapDeviceId();
    const phone = await prompt.question("Телефон, привязанный к Мой налог: ");
    const deviceId = existingDeviceId ?? randomUUID();
    const gateway = new NpdGateway({ deviceId });
    const challenge = await gateway.startSms(phone);
    const sms = await prompt.question("Код из SMS: ");
    const tokens = await gateway.completeSms(phone, challenge.challengeToken, sms);
    const profile = await gateway.getProfile();
    if (!/^\d{12}$/.test(profile.inn)) throw new Error("NPD profile did not return a valid 12-digit INN");
    const encrypted = encryptRefreshToken(tokens.refreshToken);
    await saveNpdBootstrapConnection({ inn: profile.inn, deviceId, encrypted, now: new Date() });
    stdout.write("NPD connection saved.\n");
  } finally {
    prompt.close();
    await disconnectCoreDatabase();
  }
}
void main().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "BOOTSTRAP_FAILED";
  stderr.write(`NPD bootstrap failed (${code}).\n`);
  process.exitCode = 1;
});
