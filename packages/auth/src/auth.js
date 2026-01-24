import { prisma } from "@gafus/prisma";
import bcrypt from "bcryptjs";
import CredentialsProvider from "next-auth/providers/credentials";
// Импортируем CredentialsProvider напрямую
const isProd =
  process.env.NODE_ENV === "production" && process.env.NEXTAUTH_URL?.includes("https://");
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;
const sessionStrategy = "jwt";
export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Имя пользователя", type: "text" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials) {
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
          role: user.role,
        };
      },
    }),
  ],
  session: {
    strategy: sessionStrategy,
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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const t = token;
        const userId = String(t.id ?? "");
        session.user.id = userId;
        session.user.username = String(t.username ?? "");
        // Получаем актуальную роль из БД для синхронизации с изменениями в admin-panel
        // Используем роль из токена как fallback в случае ошибки
        try {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
          });
          session.user.role = user?.role ?? t.role;
        } catch (error) {
          session.user.role = t.role;
        }
        // Получаем avatarUrl из профиля
        try {
          const profile = await prisma.userProfile.findUnique({
            where: { userId },
            select: { avatarUrl: true },
          });
          session.user.avatarUrl = profile?.avatarUrl ?? null;
        } catch (error) {
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
//# sourceMappingURL=auth.js.map
