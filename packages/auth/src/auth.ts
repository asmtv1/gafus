import { prisma } from "@gafus/prisma";
import bcrypt from "bcryptjs";
import CredentialsProvider from "next-auth/providers/credentials";

import type { AuthUser } from "@gafus/types";
import type { DefaultSession, NextAuthOptions } from "next-auth";

// Расширяем типы NextAuth для пользовательских полей
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: AuthUser["role"];
      avatarUrl?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    username: string;
    role: AuthUser["role"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: AuthUser["role"];
  }
}

// Импортируем CredentialsProvider напрямую

const isProd = process.env.NODE_ENV === "production";
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Имя пользователя", type: "text" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(
        credentials: Record<"username" | "password", string> | undefined,
      ): Promise<AuthUser> {
        if (!credentials?.username || !credentials?.password) {
          throw new Error("Введите имя пользователя и пароль");
        }

        const username = credentials.username.toLowerCase().trim();
        const user = await prisma.user.findUnique({ where: { username } });

        if (!user) throw new Error("Пользователь не найден");

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) throw new Error("Неверный пароль");

        return {
          id: user.id,
          username: user.username,
          role: user.role as "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM",
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 дней
  },
  jwt: {
    secret: process.env.NEXTAUTH_SECRET,
    maxAge: 30 * 24 * 60 * 60,
  },
  // Доверяем заголовкам X-Forwarded-* для работы через прокси
  useSecureCookies: isProd,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
      } else if (token.username) {
        // Проверяем, что ID пользователя в токене актуален
        try {
          const currentUser = await prisma.user.findUnique({
            where: { username: token.username },
            select: { id: true },
          });
          
          if (currentUser && currentUser.id !== token.id) {
            // Обновляем ID пользователя в токене
            token.id = currentUser.id;
          }
        } catch (error) {
          // Игнорируем ошибки при проверке
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.username = token.username;
        session.user.role = token.role;

        const profile = await prisma.userProfile.findUnique({
          where: { userId: token.id },
          select: { avatarUrl: true },
        });

        session.user.avatarUrl = profile?.avatarUrl ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  debug: true,
  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        domain: cookieDomain,
        secure: isProd,
      },
    },
    callbackUrl: {
      name: "next-auth.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        domain: cookieDomain,
        secure: isProd,
      },
    },
    csrfToken: {
      name: "next-auth.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        domain: cookieDomain,
        secure: isProd,
      },
    },
  },
  // Дополнительные настройки для работы с поддоменами
  secret: process.env.NEXTAUTH_SECRET,
};