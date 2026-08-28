/**
 * One-time, interactive NPD connection bootstrap. It never writes an SMS code,
 * access token, or raw refresh token to disk or stdout.
 */
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { NpdGateway, encryptRefreshToken } from "@gafus/npd";
import { prisma } from "@gafus/prisma";

const prompt = createInterface({ input: stdin, output: stdout });
async function main(): Promise<void> {
  try {
    const existing = await prisma.npdConnection.findUnique({ where: { id: "default" }, select: { deviceId: true } });
    const phone = await prompt.question("Телефон, привязанный к Мой налог: ");
    const deviceId = existing?.deviceId ?? randomUUID();
    const gateway = new NpdGateway({ deviceId });
    const challenge = await gateway.startSms(phone);
    const sms = await prompt.question("Код из SMS: ");
    const tokens = await gateway.completeSms(phone, challenge.challengeToken, sms);
    const profile = await gateway.getProfile();
    if (!/^\d{12}$/.test(profile.inn)) throw new Error("NPD profile did not return a valid 12-digit INN");
    const encrypted = encryptRefreshToken(tokens.refreshToken);
    await prisma.npdConnection.upsert({
      where: { id: "default" },
      create: { id: "default", inn: profile.inn, deviceId, refreshTokenCipher: encrypted.cipher, refreshTokenIv: encrypted.iv, refreshTokenTag: encrypted.tag, refreshTokenKeyVersion: encrypted.keyVersion, lastAuthorizedAt: new Date(), lastRefreshedAt: new Date(), status: "ACTIVE", lastErrorCode: null, lastErrorRedacted: null },
      update: { inn: profile.inn, refreshTokenCipher: encrypted.cipher, refreshTokenIv: encrypted.iv, refreshTokenTag: encrypted.tag, refreshTokenKeyVersion: encrypted.keyVersion, lastAuthorizedAt: new Date(), lastRefreshedAt: new Date(), status: "ACTIVE", lastErrorCode: null, lastErrorRedacted: null },
    });
    stdout.write("NPD connection saved.\n");
  } finally {
    prompt.close();
    await prisma.$disconnect();
  }
}
void main().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "BOOTSTRAP_FAILED";
  stderr.write(`NPD bootstrap failed (${code}).\n`);
  process.exitCode = 1;
});
