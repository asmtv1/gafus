import { prisma } from "@prisma";
import bcrypt from "bcrypt";
import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import type { AuthUser } from "@gafus/types";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Имя пользователя", type: "text" },
        password: { label: "Пароль", type: "password" },
      },

      async authorize(credentials): Promise<AuthUser> {
        if (!credentials?.username || !credentials?.password) {
          throw new Error("Введите имя пользователя и пароль");
        }

        const username = credentials.username.toLowerCase().trim();
        const user = await prisma.user.findUnique({ where: { username } });

        if (!user) throw new Error("Пользователь не найден");

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) throw new Error("Неверный пароль");

        return { id: user.id, username: user.username };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 дней
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = (user as AuthUser).username;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;

        const profile = await prisma.userProfile.findUnique({
          where: { userId: token.id as string },
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
  secret: process.env.NEXTAUTH_SECRET,
};
