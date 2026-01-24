"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.prismaClient =
  exports.prisma =
  exports.Prisma =
  exports.TranscodingStatus =
  exports.StepType =
  exports.PetType =
    void 0;
exports.isPrismaUniqueConstraintError = isPrismaUniqueConstraintError;
// Экспортируем enum как значение для использования в zod схемах
var client_1 = require("@prisma/client");
Object.defineProperty(exports, "PetType", {
  enumerable: true,
  get: function () {
    return client_1.PetType;
  },
});
Object.defineProperty(exports, "StepType", {
  enumerable: true,
  get: function () {
    return client_1.StepType;
  },
});
Object.defineProperty(exports, "TranscodingStatus", {
  enumerable: true,
  get: function () {
    return client_1.TranscodingStatus;
  },
});
// Экспортируем пространство имён Prisma (для JsonNull, Decimal и т.д.)
const client_2 = require("@prisma/client");
Object.defineProperty(exports, "Prisma", {
  enumerable: true,
  get: function () {
    return client_2.Prisma;
  },
});
// Экспортируем готовый экземпляр клиента для приложений
var client_3 = require("./client");
Object.defineProperty(exports, "prisma", {
  enumerable: true,
  get: function () {
    return client_3.prisma;
  },
});
Object.defineProperty(exports, "prismaClient", {
  enumerable: true,
  get: function () {
    return __importDefault(client_3).default;
  },
});
function isPrismaUniqueConstraintError(error) {
  return error instanceof client_2.Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
//# sourceMappingURL=index.js.map
