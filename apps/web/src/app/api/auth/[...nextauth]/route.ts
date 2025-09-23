import { authOptions } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";
import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";

// Создаем логгер для NextAuth
const logger = createWebLogger('web-nextauth');

let handler;

try {
  handler = NextAuth(authOptions as NextAuthOptions);
} catch (err) {
  logger.error("Ошибка инициализации authOptions", err as Error, {
    operation: 'nextauth_initialization_error'
  });
  throw err;
}

export { handler as GET, handler as POST };
