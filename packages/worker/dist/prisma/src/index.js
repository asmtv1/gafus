import { PrismaClient } from "@prisma/client";
console.log("⛳DATABASE_URL=", process.env.DATABASE_URL);
export const prisma = global.prisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === "development"
            ? ["query", "error", "warn"]
            : ["error"],
    });
if (process.env.NODE_ENV !== "production") {
    global.prisma = prisma;
}
export default prisma;
