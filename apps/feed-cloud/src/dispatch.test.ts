import { afterEach, describe, expect, it, vi } from "vitest";
const send = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@aws-sdk/client-sqs", () => ({ SQSClient: class { send = send; }, SendMessageCommand: class { constructor(public input: unknown) {} } }));
import { handler } from "./dispatch";
afterEach(() => { vi.unstubAllEnvs(); send.mockClear(); });
function config() { vi.stubEnv("FEED_BUCKET", "feed-private-test"); vi.stubEnv("FEED_PHOTO_QUEUE_URL", "https://queue.test/photo"); vi.stubEnv("FEED_VIDEO_QUEUE_URL", "https://queue.test/video"); }
describe("Feed queue wake-up dispatcher", () => {
 it("routes video sources without trusting event object keys as job authority", async () => {
  config(); await handler({ messages: [{ event_metadata: { event_type: "yandex.cloud.events.storage.ObjectCreate" }, details: { bucket_id: "feed-private-test", object_id: "posts/user/post/incoming/upload/source.mp4" } }] });
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ QueueUrl: "https://queue.test/video" }) }), expect.anything());
 });
 it("ignores other buckets, album paths and completed output files", async () => {
  config(); await handler({ messages: ["posts/user/post/attachments/media/full.webp", "albums/user/album/incoming/upload/source.jpg"].map(object_id => ({ event_metadata: { event_type: "yandex.cloud.events.storage.ObjectCreate" }, details: { bucket_id: "feed-private-test", object_id } })) });
  expect(send).not.toHaveBeenCalled();
 });
 it("uses the documented timer event to wake recovery and album-copy processing", async () => {
  config(); await handler({ messages: [{ event_metadata: { event_type: "yandex.cloud.events.serverless.triggers.TimerMessage" } }] });
  expect(send).toHaveBeenCalledTimes(2);
 });
 it("rejects oversized platform batches", async () => { config(); await expect(handler({ messages: Array.from({ length: 11 }, () => ({})) })).rejects.toThrow("FEED_EVENT_LIMIT"); });
});
