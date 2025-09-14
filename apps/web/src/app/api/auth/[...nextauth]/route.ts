import { authOptions } from "@gafus/auth";
import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";

let handler;

try {
  console.warn("Инициализация NextAuth...");
  handler = NextAuth(authOptions as NextAuthOptions);
  console.warn("NextAuth инициализирован успешно");
} catch (err) {
  console.error("Ошибка инициализации authOptions:", err);
  throw err;
}

export { handler as GET, handler as POST };
