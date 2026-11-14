import { prisma } from "../src/client";

export const a2ObservabilityFixture = {
  enqueue(id: string, operationId: string, traceId: string) {
    return prisma.chat2OutboxEvent.create({
      data: {
        id,
        conversationId: "a2-obs-room",
        eventType: "room.updated",
        operationId,
        traceId,
      },
    });
  },
  readEvent(id: string) {
    return prisma.chat2OutboxEvent.findUnique({
      where: { id },
      select: { deliveredAt: true, operationId: true },
    });
  },
  countDeliveries(id: string) {
    return prisma.chat2OutboxEvent.count({ where: { id, deliveredAt: { not: null } } });
  },
};
