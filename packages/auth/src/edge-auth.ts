import type { NextAuthOptions, Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";

const isProd = process.env.NODE_ENV === "production";
// Для поддоменов не указываем домен cookies, чтобы они работали локально
const cookieDomain = undefined;

// Расширяем типы для пользователя
interface ExtendedUser extends User {
  id: string;
  username: string;
  role: "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM";
}

interface ExtendedToken extends JWT {
  id: string;
  username: string;
  role: "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM";
}

interface ExtendedSession extends Session {
  user: {
    id: string;
    username: string;
    role: "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM";
    avatarUrl: string | null;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

// Edge-совместимая версия authOptions без Prisma
export const edgeAuthOptions: NextAuthOptions = {
  providers: [],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 дней
  },
  jwt: {
    secret: process.env.NEXTAUTH_SECRET,
    maxAge: 30 * 24 * 60 * 60,
  },
  useSecureCookies: isProd,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const extendedUser = user as ExtendedUser;
        token.id = extendedUser.id;
        token.username = extendedUser.username;
        token.role = extendedUser.role;
      }
      return token as ExtendedToken;
    },
    async session({ session, token }) {
      const extendedToken = token as ExtendedToken;
      if (session.user) {
        (session.user as ExtendedSession["user"]).id = extendedToken.id;
        (session.user as ExtendedSession["user"]).username = extendedToken.username;
        (session.user as ExtendedSession["user"]).role = extendedToken.role;
        (session.user as ExtendedSession["user"]).avatarUrl = null; // В Edge Runtime не можем получить avatarUrl
      }
      return session as ExtendedSession;
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
};
