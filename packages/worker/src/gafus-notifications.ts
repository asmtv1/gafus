import { sendImmediatePushNotification } from "@gafus/core/services/notifications";
import { processGafusNotificationsCore } from "@gafus/core/services/gafus";

/** Queue-facing adapter. No outbox business rules or DB access. */
export async function processGafusNotifications(batchSize = 20) {
  return processGafusNotificationsCore(
    { send: sendImmediatePushNotification },
    batchSize,
  );
}
