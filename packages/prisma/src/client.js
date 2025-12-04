import { PrismaClient } from "@prisma/client";
import { createWebLogger } from "@gafus/logger";
// Создаем логгер для prisma
const logger = createWebLogger('prisma-client');
export const prisma = globalThis.prisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
// Логируем подключение к базе данных
logger.info("Prisma client initialized", {
    databaseUrl: process.env.DATABASE_URL ? 'configured' : 'missing',
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.NODE_ENV === "development" ? "query,error,warn" : "error"
});
if (process.env.NODE_ENV !== "production") {
    globalThis.prisma = prisma;
}
export default prisma;
