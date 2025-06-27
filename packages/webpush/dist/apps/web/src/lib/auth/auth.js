"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authOptions = void 0;
const _prisma_1 = require("@prisma");
const bcrypt_1 = __importDefault(require("bcrypt"));
const credentials_1 = __importDefault(require("next-auth/providers/credentials"));
exports.authOptions = {
    providers: [
        (0, credentials_1.default)({
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
                const user = await _prisma_1.prisma.user.findUnique({ where: { username } });
                if (!user)
                    throw new Error("Пользователь не найден");
                const valid = await bcrypt_1.default.compare(credentials.password, user.password);
                if (!valid)
                    throw new Error("Неверный пароль");
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
                token.username = user.username;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id;
                session.user.username = token.username;
                const profile = await _prisma_1.prisma.userProfile.findUnique({
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
    secret: process.env.NEXTAUTH_SECRET,
};
