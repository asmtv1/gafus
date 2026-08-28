import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type Bytes = Uint8Array<ArrayBuffer>;
export type EncryptedRefreshToken = { cipher: Bytes; iv: Bytes; tag: Bytes; keyVersion: number };
type KeySlot = { version: number; key: Bytes };
const bytes = (value: unknown): Bytes => Uint8Array.from(value as ArrayLike<number>) as Bytes;

/** Parses only NPD_TOKEN_ENCRYPTION_KEY. Format: `2:base64key,1:base64oldkey`; a bare key is v1. */
export function loadTokenKeyring(value = process.env.NPD_TOKEN_ENCRYPTION_KEY): KeySlot[] {
  if (!value) throw new Error("NPD_TOKEN_ENCRYPTION_KEY is required");
  const slots = value.split(",").map((item) => {
    const [maybeVersion, material] = item.trim().split(":", 2);
    const hasVersion = /^\d+$/.test(maybeVersion) && material !== undefined;
    const version = hasVersion ? Number(maybeVersion) : 1;
    const encoded = hasVersion ? material : maybeVersion;
    const key = bytes(/^[0-9a-f]{64}$/i.test(encoded) ? Buffer.from(encoded, "hex") : Buffer.from(encoded, "base64"));
    if (version < 1 || key.length !== 32) throw new Error("NPD_TOKEN_ENCRYPTION_KEY must contain AES-256 keys");
    return { version, key };
  });
  if (!slots.length || new Set(slots.map((slot) => slot.version)).size !== slots.length) throw new Error("NPD token key versions must be unique");
  return slots.sort((a, b) => b.version - a.version);
}

export function encryptRefreshToken(token: string, keyring = loadTokenKeyring()): EncryptedRefreshToken {
  const current = keyring[0];
  const iv = bytes(randomBytes(12));
  const cipher = createCipheriv("aes-256-gcm", current.key, iv);
  const encrypted = cipher.update(token, "utf8");
  const final = cipher.final();
  return { cipher: bytes([...encrypted, ...final]), iv, tag: bytes(cipher.getAuthTag()), keyVersion: current.version };
}

export function decryptRefreshToken(value: EncryptedRefreshToken, keyring = loadTokenKeyring()): string {
  const key = keyring.find((slot) => slot.version === value.keyVersion);
  if (!key) throw new Error(`NPD token key version ${value.keyVersion} is unavailable`);
  const decipher = createDecipheriv("aes-256-gcm", key.key, value.iv);
  decipher.setAuthTag(value.tag);
  const decrypted = decipher.update(value.cipher);
  const final = decipher.final();
  return new TextDecoder().decode(bytes([...decrypted, ...final]));
}

export function rotateRefreshToken(value: EncryptedRefreshToken, keyring = loadTokenKeyring()): EncryptedRefreshToken | null {
  return value.keyVersion === keyring[0].version ? null : encryptRefreshToken(decryptRefreshToken(value, keyring), keyring);
}
