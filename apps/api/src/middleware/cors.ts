/**
 * CORS Middleware
 * Настройка разрешённых origins для web и mobile клиентов
 */
import { cors } from "hono/cors";

const ALLOWED_ORIGINS = [
  // Production
  "https://gafus.ru",
  "https://www.gafus.ru",
  "https://trainer.gafus.ru",
  "https://admin.gafus.ru",
  // Development
  "http://localhost:3000",
  "http://localhost:3002",
  "http://localhost:3003",
];

/**
 * Проверка origin через функцию (поддержка regex для Expo)
 */
const checkOrigin = (origin: string): string | null => {
  // Точные совпадения
  if (ALLOWED_ORIGINS.includes(origin)) return origin;

  // Expo development patterns
  if (/^exp:\/\//.test(origin)) return origin;
  if (/^https?:\/\/.*\.exp\.direct/.test(origin)) return origin;

  // React Native без origin (null/undefined)
  if (!origin) return "*";

  return null;
};

export const corsMiddleware = cors({
  origin: checkOrigin,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Device-Id"],
  exposeHeaders: ["X-Request-Id"],
  credentials: true,
  maxAge: 86400, // 24 hours
});
