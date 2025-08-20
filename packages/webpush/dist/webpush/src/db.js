"use server";
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserSubscriptions = getUserSubscriptions;
const prisma_1 = require("@gafus/prisma");
async function getUserSubscriptions(userId) {
    const records = await prisma_1.prisma.pushSubscription.findMany({
        where: { userId },
    });
    return records
        .map((r) => {
        const keysRaw = r.keys;
        // Проверка структуры вручную
        if (keysRaw &&
            typeof keysRaw === "object" &&
            !Array.isArray(keysRaw) &&
            "p256dh" in keysRaw &&
            "auth" in keysRaw &&
            typeof keysRaw.p256dh === "string" &&
            typeof keysRaw.auth === "string") {
            const keys = keysRaw;
            return {
                endpoint: r.endpoint,
                keys: {
                    p256dh: keys.p256dh,
                    auth: keys.auth,
                },
            };
        }
        return null;
    })
        .filter((sub) => sub !== null);
}
