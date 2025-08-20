import { PrismaClient } from "@prisma/client";

console.warn("⛳DATABASE_URL=", process.env.DATABASE_URL);

declare global {
  // Чтобы TypeScript не ругался на расширение globalThis
  var prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

export default prisma;
