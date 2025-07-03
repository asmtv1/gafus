import { PrismaClient } from "@prisma/client";
console.log("⛳DATABASE_URL=", process.env.DATABASE_URL);
/** СТАРЫЙ ВАРИАНТ
 в dev-контексте кешируем инстанс в globalThis, чтобы при хот-релоаде не плодить подключения
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
 */

declare global {
  // Чтобы TypeScript не ругался на расширение объекта globalThis
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
export default prisma;
