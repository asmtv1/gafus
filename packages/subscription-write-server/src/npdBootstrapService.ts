import { prisma } from "@gafus/prisma";

/** Persistence-only component of the explicitly interactive NPD bootstrap. */
export async function getNpdBootstrapDeviceId(): Promise<string | null> {
  const connection = await prisma.npdConnection.findUnique({
    where: { id: "default" }, select: { deviceId: true },
  });
  return connection?.deviceId ?? null;
}

export async function saveNpdBootstrapConnection(input: {
  inn: string;
  deviceId: string;
  encrypted: { cipher: Uint8Array; iv: Uint8Array; tag: Uint8Array; keyVersion: number };
  now: Date;
}): Promise<void> {
  if (!/^\d{12}$/.test(input.inn)) throw new Error("Invalid NPD profile INN");
  const token = {
    refreshTokenCipher: input.encrypted.cipher,
    refreshTokenIv: input.encrypted.iv,
    refreshTokenTag: input.encrypted.tag,
    refreshTokenKeyVersion: input.encrypted.keyVersion,
    lastAuthorizedAt: input.now,
    lastRefreshedAt: input.now,
    status: "ACTIVE" as const,
    lastErrorCode: null,
    lastErrorRedacted: null,
  };
  await prisma.npdConnection.upsert({
    where: { id: "default" },
    create: { id: "default", inn: input.inn, deviceId: input.deviceId, ...token },
    update: { inn: input.inn, ...token },
  });
}
