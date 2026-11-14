import { sendImmediatePushNotification } from "@gafus/notifications-server";
import { processGafusNotificationsCore } from "@gafus/notifications-server/gafus-delivery";

/** Queue-facing adapter. No outbox business rules or DB access. */
export async function processGafusNotifications(batchSize = 20) {
  return processGafusNotificationsCore(
    { send: sendImmediatePushNotification },
    batchSize,
  );
}
