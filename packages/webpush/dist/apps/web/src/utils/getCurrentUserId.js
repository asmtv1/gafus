"use server";
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentUserId = getCurrentUserId;
const next_auth_1 = require("next-auth");
const auth_1 = require("@/lib/auth/auth");
async function getCurrentUserId() {
    const session = await (0, next_auth_1.getServerSession)(auth_1.authOptions);
    if (!session?.user?.id) {
        throw new Error("Вы не авторизован");
    }
    return session.user.id;
}
