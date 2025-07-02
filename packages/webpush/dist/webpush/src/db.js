"use server";
import { prisma } from "@gafus/prisma";
/**
 * Возвращает все PushSubscription записи из БД
 * в формате, который понимает PushManager (endpoint + ключи).
 */
export async function getAllSubscriptions() {
    const records = await prisma.pushSubscription.findMany();
    return records
        .map((r) => {
        if (r.keys &&
            typeof r.keys === "object" &&
            typeof r.keys.p256dh === "string" &&
            typeof r.keys.auth === "string") {
            return {
                endpoint: r.endpoint,
                keys: {
                    p256dh: r.keys.p256dh,
                    auth: r.keys.auth,
                },
            };
        }
        // Optionally, skip or throw if keys are invalid
        return null;
    })
        .filter((sub) => sub !== null);
}
