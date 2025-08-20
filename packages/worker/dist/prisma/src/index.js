"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prismaClient = exports.prisma = exports.createPrismaClient = void 0;
// Экспортируем функцию для создания клиента (только для внутреннего использования)
const createPrismaClient = async () => {
    // Динамический импорт для избежания проблем с SSR
    const { PrismaClient } = await import("@prisma/client");
    return new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
};
exports.createPrismaClient = createPrismaClient;
// Экспортируем готовый экземпляр клиента для приложений
var client_1 = require("./client");
Object.defineProperty(exports, "prisma", { enumerable: true, get: function () { return client_1.prisma; } });
Object.defineProperty(exports, "prismaClient", { enumerable: true, get: function () { return __importDefault(client_1).default; } });
