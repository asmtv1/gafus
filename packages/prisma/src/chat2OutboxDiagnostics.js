import { prisma } from "./client";
/** Admin-only query service. No conversation IDs, messages or actor data. */
export async function listChatOutboxDeadLetters() {
    return prisma.chat2OutboxEvent.findMany({
        where: { deadLetteredAt: { not: null }, deliveredAt: null },
        select: {
            id: true, eventType: true, createdAt: true, deadLetteredAt: true,
            lastErrorCode: true, attempts: true, operationId: true, traceId: true,
        },
        orderBy: { deadLetteredAt: "desc" }, take: 50,
    });
}
/** Atomic compare-and-swap: never reset a delivered, live or claimed event. */
export async function retryChatOutboxDeadLetter(eventId) {
    const updated = await prisma.chat2OutboxEvent.updateMany({
        where: {
            id: eventId, deliveredAt: null, deadLetteredAt: { not: null },
            claimedUntil: null,
        },
        data: {
            deadLetteredAt: null, lastErrorCode: null, claimedUntil: null,
            claimToken: null, attempts: 0, nextAttemptAt: new Date(),
        },
    });
    return updated.count === 1;
}
//# sourceMappingURL=chat2OutboxDiagnostics.js.map