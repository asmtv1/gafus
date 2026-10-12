import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@gafus/prisma";
import CredentialsProviderModule from "next-auth/providers/credentials";

// next-auth v4 ships CommonJS nested default exports. Native Node ESM and
// Next.js bundlers expose different module shapes; both must resolve the factory.
const CredentialsProvider = (CredentialsProviderModule as unknown as {
  default?: typeof CredentialsProviderModule;
}).default ?? CredentialsProviderModule;

import { createWebLogger } from "@gafus/logger";

import type { NextAuthOptions } from "next-auth";
import {
  authenticatePasswordCredentials,
  getActiveSessionUser, getSessionProfileAvatar,
} from "@gafus/core/services/auth/identityReadService";
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

        return authenticatePasswordCredentials(credentials.username, credentials.password);
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
        token.authenticatedAt = Date.now();
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

        let currentUser: { role: string; passwordSetAt: Date | null; sessionsRevokedAt: Date | null; phone: string | null; email: string | null; registrationPending: boolean } | null;
        try {
          currentUser = await getActiveSessionUser(userId);
        } catch {
          // A database outage must not turn into an authorization decision here;
          // retain the existing JWT fallback for already authenticated users.
          currentUser = null;
        }
        // This is intentionally outside the catch: a provisional, deleted or
        // currently unverifiable account must never acquire a usable NextAuth
        // session through the JWT fallback branch.
        if (!currentUser || currentUser.registrationPending) {
          throw new Error("Pending registration session denied");
        }
        // Never refresh this timestamp when NextAuth rolls the JWT expiration.
        // Legacy cookies without it are denied after the first password reset.
        if (currentUser.sessionsRevokedAt &&
          (typeof t.authenticatedAt !== "number" || t.authenticatedAt <= currentUser.sessionsRevokedAt.getTime())) {
          throw new Error("Session revoked");
        }
        session.user.role = currentUser.role as AuthUser["role"];
        session.user.passwordSetAt = currentUser.passwordSetAt;
        session.user.needsPhone = currentUser.phone?.startsWith("vk_") ?? false;
        session.user.email = currentUser.email;

        try {
          session.user.avatarUrl = await getSessionProfileAvatar(userId);
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
