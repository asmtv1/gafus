import {
  Expo,
  type ExpoPushMessage,
  type ExpoPushReceipt,
  type ExpoPushReceiptId,
  type ExpoPushTicket,
} from "expo-server-sdk";
import { createWorkerLogger } from "@gafus/logger";
import { prisma } from "@gafus/prisma";
import type { PushSubscriptionJSON } from "./partitionPushSubscriptions";

const logger = createWorkerLogger("expo-push");

const expoClient = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
  useFcmV1: true,
});

function shouldDeleteByCode(code?: string): boolean {
  return code === "DeviceNotRegistered";
}

export interface ExpoSendResult {
  successCount: number;
  failureCount: number;
  deletedCount: number;
  temporaryFailureCount: number;
}

export async function deleteInvalidPushRegistrations(subscriptions: PushSubscriptionJSON[], endpoints: ReadonlySet<string>) {
  const registrations = subscriptions.flatMap(({ endpoint, registration }) =>
    endpoints.has(endpoint) && registration ? [{ endpoint, ...registration }] : []);
  if (!registrations.length) return 0;
  let deleted = 0;
  for (let start = 0; start < registrations.length; start += 100) {
    const result = await prisma.pushSubscription.deleteMany({ where: { OR: registrations.slice(start, start + 100) } });
    deleted += result.count;
  }
  return deleted;
}

export async function sendExpoPushNotifications(
  subscriptions: PushSubscriptionJSON[],
  payload: {
    title: string;
    body: string;
    url: string;
  },
): Promise<ExpoSendResult> {
  const expoTokens = subscriptions
    .map((subscription) => subscription.endpoint)
    .filter((endpoint) => Expo.isExpoPushToken(endpoint));

  if (expoTokens.length === 0) {
    return { successCount: 0, failureCount: 0, deletedCount: 0, temporaryFailureCount: 0 };
  }

  const messages: ExpoPushMessage[] = expoTokens.map((to) => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: { url: payload.url },
  }));

  const tickets: ExpoPushTicket[] = [];
  for (const chunk of expoClient.chunkPushNotifications(messages)) {
    const chunkTickets = await expoClient.sendPushNotificationsAsync(chunk);
    tickets.push(...chunkTickets);
  }

  let successCount = 0;
  let failureCount = 0;
  let temporaryFailureCount = 0;
  const invalidEndpoints = new Set<string>();
  const receiptIds: ExpoPushReceiptId[] = [];
  const receiptToTokenIndex = new Map<string, number>();

  tickets.forEach((ticket, index) => {
    if (ticket.status === "ok") {
      successCount++;
      if (ticket.id) {
        receiptIds.push(ticket.id);
        receiptToTokenIndex.set(ticket.id, index);
      }
      return;
    }

    failureCount++;
    if (shouldDeleteByCode(ticket.details?.error)) {
      invalidEndpoints.add(expoTokens[index]!);
    } else {
      temporaryFailureCount++;
    }
  });

  for (const chunk of expoClient.chunkPushNotificationReceiptIds(receiptIds)) {
    const receipts = (await expoClient.getPushNotificationReceiptsAsync(chunk)) as Record<
      string,
      ExpoPushReceipt
    >;
    for (const [receiptId, receipt] of Object.entries(receipts)) {
      if (receipt.status !== "error") continue;
      const ticketIndex = receiptToTokenIndex.get(receiptId);
      if (ticketIndex == null) continue;

      successCount--;
      failureCount++;
      if (shouldDeleteByCode(receipt.details?.error)) {
        invalidEndpoints.add(expoTokens[ticketIndex]!);
      } else {
        temporaryFailureCount++;
      }
    }
  }

  const deletedCount = await deleteInvalidPushRegistrations(subscriptions, invalidEndpoints);

  logger.info("Expo push batch completed", {
    total: expoTokens.length,
    successCount,
    failureCount,
    temporaryFailureCount,
    deletedCount,
  });

  return {
    successCount,
    failureCount,
    deletedCount,
    temporaryFailureCount,
  };
}
