import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@gafus/prisma";
import bcrypt from "bcryptjs";
import CredentialsProvider from "next-auth/providers/credentials";

import { createWebLogger } from "@gafus/logger";

import type { NextAuthOptions } from "next-auth";
import type { AuthUser } from "./next-auth.d";

const logger = createWebLogger("auth");

// Импортируем CredentialsProvider напрямую

const isProd =
  process.env.NODE_ENV === "production" && process.env.NEXTAUTH_URL?.includes("https://");
// При ngrok — не задавать domain, иначе cookie не сохранится на ngrok-хосте
const cookieDomain =
  /ngrok/i.test(process.env.NEXTAUTH_URL ?? "")
    ? undefined
    : (process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined);

const sessionStrategy = "jwt" as const;

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

        // VK ID one-time token (web callback redirect)
        if (credentials.username === "__vk_id__" && credentials.password) {
          const { consumeVkIdOneTimeUser } = await import("./vkIdOneTimeStore");
          const vkUser = await consumeVkIdOneTimeUser(credentials.password);
          if (!vkUser) throw new Error("Токен VK ID недействителен или истёк");
          return {
            id: vkUser.userId,
            username: vkUser.username,
            role: vkUser.role as AuthUser["role"],
          };
        }

        const username = credentials.username.toLowerCase().trim();
        const user = await prisma.user.findUnique({
          where: { username },
          select: { id: true, username: true, role: true, password: true, passwordSetAt: true },
        });

        if (!user) throw new Error("Неверный логин или пароль");
        if (user.passwordSetAt === null) {
          throw new Error("Войдите через VK ID или установите пароль в профиле");
        }

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) throw new Error("Неверный логин или пароль");

        return {
          id: user.id,
          username: user.username,
          role: user.role as "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM",
        };
      },
    }),
  ],
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: sessionStrategy,
    maxAge: 30 * 24 * 60 * 60, // 30 дней
  },
  jwt: {
    secret: process.env.NEXTAUTH_SECRET,
    maxAge: 30 * 24 * 60 * 60,
  },
  useSecureCookies: isProd,
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user && "username" in user && "role" in user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
      }
      if (trigger === "update" && session && "username" in session && session.username != null) {
        token.username = session.username;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const t = token as Record<string, unknown>;
        const userId = String(t.id ?? "");

        session.user.id = userId;
        session.user.username = String(t.username ?? "");

        try {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true, passwordSetAt: true, phone: true, email: true },
          });
          session.user.role = (user?.role as AuthUser["role"]) ?? (t.role as AuthUser["role"]);
          session.user.passwordSetAt = user?.passwordSetAt ?? null;
          session.user.needsPhone = user?.phone?.startsWith("vk_") ?? false;
          session.user.email = user?.email ?? null;
        } catch {
          session.user.role = t.role as AuthUser["role"];
          session.user.passwordSetAt = null;
          session.user.needsPhone = false;
          session.user.email = null;
        }

        try {
          const profile = await prisma.userProfile.findUnique({
            where: { userId },
            select: { avatarUrl: true },
          });
          session.user.avatarUrl = profile?.avatarUrl ?? null;
        } catch {
          session.user.avatarUrl = null;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  debug: false,
  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        domain: cookieDomain,
        secure: isProd,
        maxAge: 30 * 24 * 60 * 60, // 30 дней
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
        maxAge: 30 * 24 * 60 * 60, // 30 дней
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
        maxAge: 30 * 24 * 60 * 60, // 30 дней
      },
    },
  },
  // Дополнительные настройки для работы с поддоменами
  secret: process.env.NEXTAUTH_SECRET,
};
