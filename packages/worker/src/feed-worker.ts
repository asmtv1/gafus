import { runFeedBackgroundOperations, getFeedPushSubscriptions } from "@gafus/feed-server/background-operations";
import type { FeedNotificationDelivery } from "@gafus/feed-server/background-operations";
import { PushNotificationService, partitionPushSubscriptions, sendExpoPushNotifications } from "@gafus/webpush";
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
    let failures = 0;
    if (parts.web.length) {
      web ??= PushNotificationService.fromEnvironment();
      const result = await web.sendNotifications(parts.web, JSON.stringify({ ...payload,
        icon: "/icons/icon192.png", badge: "/icons/badge-72.png", data: { url } }));
      failures += result.failureCount;
    }
    if (parts.expo.length) failures += (await sendExpoPushNotifications(parts.expo, payload)).temporaryFailureCount;
    if (failures) throw new Error("FEED_PUSH_RETRY");
  },
};
/** Public feature flags do not stop cleanup; scheduler enablement is an independent migration gate. */
export async function processFeedBackgroundTasks() {
  if (running) return { skipped: true };
  running = true;
  try {
    return runFeedBackgroundOperations(feedPushDelivery, process.env.FEED_PUSH_ENABLED === "true");
  } finally { running = false; }
}
