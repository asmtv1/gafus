import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
interface Event { messages?: { event_metadata?: { event_type?: string }; details?: { bucket_id?: string; object_id?: string } }[] }
let client: SQSClient | undefined;
export async function handler(event: Event) {
  client ??= new SQSClient({ endpoint: "https://message-queue.api.cloud.yandex.net", region: "ru-central1", maxAttempts: 2,
    credentials: { accessKeyId: process.env.FEED_QUEUE_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.FEED_QUEUE_SECRET_ACCESS_KEY ?? "" } });
  if ((event.messages?.length ?? 0) > 10) throw new Error("FEED_EVENT_LIMIT");
  const kinds = new Set<string>();
  for (const message of event.messages ?? []) {
    const type = message.event_metadata?.event_type;
    if (type === "yandex.cloud.events.timer.TimerMessage") { kinds.add("photo"); kinds.add("video"); continue; }
    if (type !== "yandex.cloud.events.storage.ObjectCreate" && type !== "yandex.cloud.events.storage.ObjectUpdate") continue;
    if (message.details?.bucket_id !== process.env.FEED_BUCKET) continue;
    const match = /^posts\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/incoming\/[A-Za-z0-9_-]{1,128}\/source\.(jpg|jpeg|png|webp|mp4|mov|webm)$/.exec(message.details?.object_id ?? "");
    if (match) kinds.add(["mp4", "mov", "webm"].includes(match[1]) ? "video" : "photo");
  }
  for (const kind of kinds) {
    const url = process.env[kind === "video" ? "FEED_VIDEO_QUEUE_URL" : "FEED_PHOTO_QUEUE_URL"];
    if (!url) throw new Error("FEED_QUEUE_UNAVAILABLE");
    await client.send(new SendMessageCommand({ QueueUrl: url, MessageBody: JSON.stringify({ version: 1, wake: true }) }), { abortSignal: AbortSignal.timeout(5000) });
  }
  return { statusCode: 200, body: "" };
}
