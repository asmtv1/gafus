// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck - Buffer types are incompatible with strict TypeScript, but work at runtime
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "crypto";
import { createTrainerPanelLogger } from "@gafus/logger";

const logger = createTrainerPanelLogger("ai-chat-encryption");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits для GCM (12 bytes)
const KEY_LENGTH = 32; // 32 bytes для AES-256
const SALT_LENGTH = 16;
const ITERATIONS = 100000; // PBKDF2 iterations

// Получение ключа шифрования из переменной окружения
// Используем PBKDF2 для получения 32-байтного ключа из строки
function getEncryptionKey(): Buffer {
  const keyEnv = process.env.AI_API_KEY_ENCRYPTION_KEY;
  if (!keyEnv || keyEnv.length < 16) {
    throw new Error("AI_API_KEY_ENCRYPTION_KEY must be at least 16 characters");
  }

  // Используем фиксированную соль из env или генерируем (для консистентности)
  const salt = process.env.AI_API_KEY_ENCRYPTION_SALT || "gafus-ai-enc-salt";
  const saltString = salt.slice(0, SALT_LENGTH);

  // Генерируем 32-байтный ключ через PBKDF2
  return pbkdf2Sync(keyEnv, saltString, ITERATIONS, KEY_LENGTH, "sha256");
}

export function encryptApiKey(apiKey: string): string {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("API key cannot be empty");
  }

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(apiKey, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();

  // Формат: iv:tag:encrypted (все в hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

export function decryptApiKey(encrypted: string): string {
  if (!encrypted || typeof encrypted !== "string") {
    throw new Error("Encrypted data is required");
  }

  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }

  const [ivHex, tagHex, encryptedData] = parts;

  if (!ivHex || !tagHex || !encryptedData) {
    throw new Error("Invalid encrypted data format: missing components");
  }

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");

    if (iv.length !== IV_LENGTH) {
      throw new Error("Invalid IV length");
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    // Если ошибка расшифровки - возможно, ключ шифрования изменился
    if (
      error instanceof Error &&
      (error.message.includes("decrypt") || error.message.includes("authentication tag"))
    ) {
      logger.error("Failed to decrypt API key - encryption key may have changed", error);
      throw new Error("Не удалось расшифровать API ключ. Пожалуйста, обновите ключ в настройках.");
    }
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
