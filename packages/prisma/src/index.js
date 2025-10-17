"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prismaClient = exports.prisma = exports.PetType = void 0;
// Экспортируем enum как значение для использования в zod схемах
var client_1 = require("@prisma/client");
Object.defineProperty(exports, "PetType", { enumerable: true, get: function () { return client_1.PetType; } });
// Экспортируем готовый экземпляр клиента для приложений
var client_2 = require("./client");
Object.defineProperty(exports, "prisma", { enumerable: true, get: function () { return client_2.prisma; } });
Object.defineProperty(exports, "prismaClient", { enumerable: true, get: function () { return __importDefault(client_2).default; } });
