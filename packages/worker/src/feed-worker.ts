import { runFeedBackgroundOperations, getFeedPushSubscriptions } from "@gafus/feed-server/background-operations";
import type { FeedNotificationDelivery } from "@gafus/feed-server/background-operations";
import { PushNotificationService, partitionPushSubscriptions, sendExpoPushNotifications, deleteInvalidPushRegistrations } from "@gafus/webpush";
let running = false;
let web: ReturnType<typeof PushNotificationService.fromEnvironment> | undefined;
export const feedPushDelivery: FeedNotificationDelivery = {
  async deliver(notification) {
    const subscriptions = await getFeedPushSubscriptions(notification.recipientId);
    if (!subscriptions.length) return;
    const parts = partitionPushSubscriptions(subscriptions);
    const text = {
      author_post: "Новая публикация автора, на которого вы подписаны.",
      comment: "Новый комментарий к вашей публикации.", reply: "Новый ответ на ваш комментарий.",
      post_reaction: "На вашу публикацию отреагировали.", comment_reaction: "На ваш комментарий отреагировали.",
    }[notification.kind];
    const url = `/feed/${encodeURIComponent(notification.postId)}` +
      (notification.commentId ? `?commentId=${encodeURIComponent(notification.commentId)}` : "");
    const payload = { title: "Моменты GAFUS", body: text, url };
    // The feed outbox acknowledges one recipient. Always try both channels,
    // and do not replay an accepted notification to their other devices.
    const attempts: Promise<{ accepted: number; temporary: number }>[] = [];
    if (parts.web.length) {
      attempts.push((async () => {
        web ??= PushNotificationService.fromEnvironment();
        const result = await web.sendNotifications(parts.web, JSON.stringify({ ...payload,
          icon: "/icons/icon192.png", badge: "/icons/badge-72.png", data: { url } }));
        const invalid = new Set(result.results.filter(row =>
          !row.success && PushNotificationService.shouldDeleteSubscription(row.error)).map(row => row.endpoint));
        if (invalid.size) await deleteInvalidPushRegistrations(parts.web, invalid);
        return { accepted: result.successCount, temporary: result.failureCount - invalid.size };
      })());
    }
    if (parts.expo.length) {
      attempts.push(sendExpoPushNotifications(parts.expo, payload).then(result => ({
        accepted: result.successCount, temporary: result.temporaryFailureCount,
      })));
    }
    const results = await Promise.allSettled(attempts);
    if (!results.some(r => r.status === "fulfilled" && r.value.accepted > 0) &&
        results.some(r => r.status === "rejected" || r.value.temporary > 0)) {
      throw new Error("FEED_PUSH_RETRY");
    }
  },
};
/** Public feature flags do not stop cleanup; scheduler enablement is an independent migration gate. */
export async function processFeedBackgroundTasks() {
  if (running) return { skipped: true };
  running = true;
  try {
    return await runFeedBackgroundOperations(feedPushDelivery, process.env.FEED_PUSH_ENABLED === "true");
  } finally { running = false; }
}
