"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const logger_1 = require("@gafus/logger");
// Создаем логгер для prisma
const logger = (0, logger_1.createWebLogger)("prisma-client");
exports.prisma =
  globalThis.prisma ??
  new client_1.PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
// Логируем подключение к базе данных
logger.info("Prisma client initialized", {
  databaseUrl: process.env.DATABASE_URL ? "configured" : "missing",
  environment: process.env.NODE_ENV || "development",
  logLevel: process.env.NODE_ENV === "development" ? "query,error,warn" : "error",
});
if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = exports.prisma;
}
exports.default = exports.prisma;
//# sourceMappingURL=client.js.map
