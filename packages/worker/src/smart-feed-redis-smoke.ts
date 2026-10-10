/** Isolated Redis snapshot/TTL smoke test, never touches live recommendation keys. */
import { randomUUID } from "node:crypto";
import Redis from "ioredis";

async function main(): Promise<void> {
  const url = process.env.FEED_SMART_TEST_REDIS_URL;
  if (!url || process.env.FEED_SMART_REDIS_TEST_CONFIRM !== "YES") {
    throw new Error("Explicit FEED_SMART_TEST_REDIS_URL and FEED_SMART_REDIS_TEST_CONFIRM=YES are required");
  }
  const parsed = new URL(url);
  if (!["redis:", "rediss:"].includes(parsed.protocol) || parsed.pathname !== "/15") {
    throw new Error("Redis verification requires an explicitly isolated database 15");
  }
  const redis = new Redis(url, {
    lazyConnect: true, connectTimeout: 1500, maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    enableOfflineQueue: false,
  });
  const key = "feed:smart:smoke:" + randomUUID();
  try {
    await redis.connect();
    const record = { viewer: "test", ids: ["a", "b"], version: "smoke" };
    await redis.set(key, JSON.stringify(record), "EX", 30);
    const raw = await redis.get(key);
    if (!raw || JSON.stringify(JSON.parse(raw)) !== JSON.stringify(record)) {
      throw new Error("Redis snapshot roundtrip failed");
    }
    const ttl = await redis.ttl(key);
    if (ttl < 1 || ttl > 30) throw new Error("Redis TTL invalid");
    await redis.del(key);
    if (await redis.get(key) !== null) throw new Error("Redis cleanup failed");
    process.stdout.write("Isolated Redis snapshot, TTL and cleanup verified.\n");
  } finally {
    if (redis.status === "ready") await redis.del(key);
    redis.disconnect();
  }
}
void main().catch(error => {
  process.stderr.write(error instanceof Error ? error.message + "\n" : "Redis smoke failed\n");
  process.exitCode = 1;
});
