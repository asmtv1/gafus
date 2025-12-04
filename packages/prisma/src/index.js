// Экспортируем enum как значение для использования в zod схемах
export { PetType } from "@prisma/client";
// Экспортируем пространство имён Prisma (для JsonNull, Decimal и т.д.)
export { Prisma } from "@prisma/client";
// Экспортируем готовый экземпляр клиента для приложений
export { prisma, default as prismaClient } from "./client";
