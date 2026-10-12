import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  subscriptions: vi.fn(), web: vi.fn(), expo: vi.fn(), rustore: vi.fn(), partition: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({ prisma: { pushSubscription: { findMany: mocks.subscriptions } } }));
vi.mock("@gafus/webpush", () => ({
  PushNotificationService: { fromEnvironment: () => ({ sendNotifications: mocks.web }) },
  partitionPushSubscriptions: mocks.partition, sendExpoPushNotifications: mocks.expo, sendRustorePushNotifications: mocks.rustore,
}));
vi.mock("@gafus/core/services/feed", () => ({ getFeedPushSubscriptions: mocks.subscriptions, runFeedBackgroundOperations: vi.fn() }));
import { feedPushDelivery } from "./feed-worker";
const event = { notificationId: "note", recipientId: "recipient", kind: "reply" as const,
  postId: "post", commentId: "comment", actorIds: ["actor"] };
beforeEach(() => {
  vi.clearAllMocks(); vi.unstubAllEnvs();
  mocks.subscriptions.mockResolvedValue([{ endpoint: "ExpoPushToken[token]", keys: {} }]);
  mocks.partition.mockReturnValue({ web: [], expo: [{}], rustore: [] });
  mocks.expo.mockResolvedValue({ temporaryFailureCount: 0 });
});
describe("feed push delivery adapter", () => {
  it("delivers a post/comment URL through the existing native provider", async () => {
    await feedPushDelivery.deliver(event);
    expect(mocks.expo).toHaveBeenCalledWith([{}], {
      title: "Моменты GAFUS", body: "Новый ответ на ваш комментарий.", url: "/feed/post?commentId=comment",
    });
  });
  it("delivers subscribed author posts as push with the post link", async () => {
    await feedPushDelivery.deliver({ ...event, kind: "author_post", commentId: null });
    expect(mocks.expo).toHaveBeenCalledWith([{}], { title: "Моменты GAFUS", body: "Новая публикация автора, на которого вы подписаны.", url: "/feed/post" });
  });
  it("finishes gracefully without subscriptions", async () => {
    mocks.subscriptions.mockResolvedValue([]);
    await feedPushDelivery.deliver(event);
    expect(mocks.expo).not.toHaveBeenCalled(); expect(mocks.web).not.toHaveBeenCalled();
  });
  it("propagates temporary provider failures for outbox retry", async () => {
    mocks.expo.mockResolvedValue({ temporaryFailureCount: 1 });
    await expect(feedPushDelivery.deliver(event)).rejects.toThrow("FEED_PUSH_RETRY");
  });
  it("sends web push with a clickable URL and grouped generic reaction text", async () => {
    mocks.partition.mockReturnValue({ web: [{}], expo: [], rustore: [] });
    mocks.web.mockResolvedValue({ failureCount: 0 });
    await feedPushDelivery.deliver({ ...event, kind: "post_reaction", commentId: null });
    const payload = JSON.parse(mocks.web.mock.calls[0][1]);
    expect(payload.data.url).toBe("/feed/post");
    expect(payload.body).toBe("На вашу публикацию отреагировали.");
  });
  it("does not silently complete unconfigured RuStore delivery", async () => {
    vi.stubEnv("RUSTORE_PUSH_SERVICE_TOKEN", ""); vi.stubEnv("RUSTORE_PROJECT_ID", "");
    mocks.partition.mockReturnValue({ web: [], expo: [], rustore: [{}] });
    await expect(feedPushDelivery.deliver(event)).rejects.toThrow("FEED_PUSH_UNAVAILABLE");
  });
});
