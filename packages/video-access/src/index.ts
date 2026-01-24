import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "crypto";

/**
 * Данные токена доступа к видео
 */
export interface VideoAccessToken {
  videoId: string;
  userId: string;
  expiresAt: number; // Unix timestamp
}

/**
 * Опции для генерации токена
 */
export interface GenerateTokenOptions {
  videoId: string;
  userId: string;
  ttlMinutes?: number; // По умолчанию 60 минут
}

/**
 * Сервис для управления доступом к HLS видео через signed URLs
 */
export class VideoAccessService {
  private secret: string;

  constructor(secret?: string) {
    this.secret = secret || process.env.VIDEO_ACCESS_SECRET || this.generateDefaultSecret();
  }

  /**
   * Генерирует секрет по умолчанию (если не задан в env)
   */
  private generateDefaultSecret(): string {
    // В production обязательно должен быть установлен VIDEO_ACCESS_SECRET
    if (process.env.NODE_ENV === "production") {
      throw new Error("VIDEO_ACCESS_SECRET must be set in production");
    }
    return randomBytes(32).toString("hex");
  }

  /**
   * Генерирует токен доступа к видео
   */
  generateToken(options: GenerateTokenOptions): string {
    const { videoId, userId, ttlMinutes = 60 } = options;

    const payload: VideoAccessToken = {
      videoId,
      userId,
      expiresAt: Date.now() + ttlMinutes * 60 * 1000,
    };

    return jwt.sign(payload, this.secret, {
      algorithm: "HS256",
      expiresIn: `${ttlMinutes}m`,
    });
  }

  /**
   * Проверяет токен доступа
   */
  verifyToken(token: string): VideoAccessToken | null {
    try {
      const payload = jwt.verify(token, this.secret, {
        algorithms: ["HS256"],
      }) as VideoAccessToken;

      // Дополнительная проверка времени жизни
      if (payload.expiresAt < Date.now()) {
        return null;
      }

      return payload;
    } catch (error) {
      console.error("Token verification failed:", error);
      return null;
    }
  }

  /**
   * Генерирует подписанный URL для HLS манифеста или сегмента
   * @param baseUrl - Базовый URL к файлу
   * @param videoId - ID видео
   * @param userId - ID пользователя
   * @param ttlMinutes - Время жизни токена в минутах
   */
  generateSignedUrl(
    baseUrl: string,
    videoId: string,
    userId: string,
    ttlMinutes: number = 60,
  ): string {
    const token = this.generateToken({ videoId, userId, ttlMinutes });

    const url = new URL(baseUrl);
    url.searchParams.set("token", token);

    return url.toString();
  }

  /**
   * Проверяет подписанный URL
   * @param url - URL с токеном
   * @returns Валидированные данные токена или null
   */
  verifySignedUrl(url: string): VideoAccessToken | null {
    try {
      const urlObj = new URL(url);
      const token = urlObj.searchParams.get("token");

      if (!token) {
        return null;
      }

      return this.verifyToken(token);
    } catch (error) {
      console.error("Signed URL verification failed:", error);
      return null;
    }
  }

  /**
   * Генерирует HMAC подпись для URL (альтернативный метод)
   * Используется для дополнительной защиты
   */
  generateHmacSignature(data: string): string {
    return createHash("sha256")
      .update(data + this.secret)
      .digest("hex");
  }

  /**
   * Проверяет HMAC подпись
   */
  verifyHmacSignature(data: string, signature: string): boolean {
    const expected = this.generateHmacSignature(data);
    return expected === signature;
  }
}

/**
 * Синглтон инстанс сервиса
 */
let serviceInstance: VideoAccessService | null = null;

/**
 * Получает инстанс сервиса (синглтон)
 */
export function getVideoAccessService(): VideoAccessService {
  if (!serviceInstance) {
    serviceInstance = new VideoAccessService();
  }
  return serviceInstance;
}

/**
 * Создаёт новый инстанс сервиса с кастомным секретом
 */
export function createVideoAccessService(secret: string): VideoAccessService {
  return new VideoAccessService(secret);
}
